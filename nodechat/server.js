/**
 * Important note: this application is not suitable for benchmarks!
 */

var http = require('http')
  , url = require('url')
  , fs = require('fs')
  , io = require('socket.io')
  , sys = require(process.binding('natives').util ? 'util' : 'sys')
  , server;
    
server = http.createServer(function(req, res){

  var path = url.parse(req.url).pathname;
  //console.log(path);
  switch (path){
    case '/':
      fs.readFile(__dirname +'/chat.html' , function(err, data){
        if (err) return send404(res);
        res.writeHead(200, {'Content-Type': 'text/html'})
        res.write(data, 'utf8');
        //console.log(data );这个data是文件的内容
        res.end();
      });
      break;
      
    case '/json.js':
    case '/jquery.js':
      fs.readFile(__dirname + path, function(err, data){
        if (err) return send404(res);
        res.writeHead(200, {'Content-Type': 'text/javascript' })
        res.write(data, 'utf8');
        //console.log(data );这个data是文件的内容
        res.end();
      });
      break;
    default: send404(res);
  }
}),



send404 = function(res){
  res.writeHead(404);
  res.write('404');
  res.end();
};

server.listen(8080);

// socket.io
var socket = io.listen(server);
var sessions={};//Use to save the sessions of the clients
var groupList={};//Use to save the groups on the server.
var initialized=false;//To indicate wether the server is initaled 

console.log("Servering is running on '127.0.0.1:8080'");

//When the connection is built up, create four hard code group and return it.
function initial(client){
  //Hard code four group	
  createGroup("News");
  createGroup("Sports");
  createGroup("Entertaiment");
  createGroup("Default");
  var groupName=[];
  for(var i in groupList)
     if(groupList[i].groupName!='Default')
		    groupName.push(groupList[i].groupName);
      
  //Send the name to client
  client.send({groupList:groupName});
}

//Using to create a group in groupList.
function createGroup(name){
	for (var i in groupList) {
    var group = groupList[i];
    if (group && group.groupName === name) 
       return "Group name has existed in the room";
    } 
    var group={
		groupName:name,//The name is the id of group. It is unique in groupList
		buffer:[],//This array save all the log of this group
		inGroup:[],//The id in group
		notInGroup:[],//The id not in group
		destroy: function () {
            delete groups[group.groupName];
        }
	};
	groupList[group.groupName]=group;
	return null;
}

//Adding the id to group.notInGroup array. This array will be used when doing broadcast.
//Also add the id to group.inGroup array 
function addIdInGroups(groupName,id){
	for(var i in groupList){
		if(groupList[i].groupName!=groupName){
		    groupList[i].notInGroup.push(id);
	    }else{
			groupList[i].inGroup.push(id);
	    }
	}	
}



//return the array which contains all the id of the clients in other groups
function returnProperArray(groupName,id){
   var group=groupList[groupName];
   if(group){
     var temp=group.notInGroup.slice(0);
     temp.push(id);
     return temp;
   }
   else return null;
}

//Session destroy function.
function sessionDestroy(idTemp){
	 //remove id from inGroup array and notInGroup array
	 for(var i in groupList){
		   var group=groupList[i];
		   counter=(group.inGroup.length>group.notInGroup.length)?group.inGroup.length:group.notInGroup.length;
		   for(var j=0;j<counter;j++){
			   if(group.inGroup[j]==idTemp)
			      group.inGroup.slice(j+1,1);
			   if(group.notInGroup[j]==idTemp)
			      group.notInGroup.slice(j+1,1);
		   }
	 }
	 //Delete the session from sessions
     delete sessions[idTemp];
}

//create a new session for a client.
function createSession(nick,group,id){
  if (nick.length > 50) return "User name is long than 50";
  if (/[^\w_\-^!]/.exec(nick)) return "User name contains some illigal symbols ";

  for (var i in sessions) {
    var session = sessions[i];
    if (session && session.nick === nick&&session.group===group) 
       return "User name has existed";
  }
  
  addIdInGroups(group,id);
    
  var session = { 
    nick: nick, 
    group:group,
    id: id,
    destroy: sessionDestroy(this.id)       
  };
  
  sessions[session.id] = session;
  return null;
}

socket.on('connection', function(client){
	
  //if connction is built, send the group exists to client 

  initial(client);
  
  client.on('message', function(message){
	    //if the message is received in this format{nick:nick, group:group}
	    if(!message.value){
		   var sessionReturn=createSession(message.nick,message.group,client.sessionId);
		   if(sessionReturn){
			//When there are some errors about creating session for a client
			client.send({ error: sessionReturn});
	       }
	       else{//Successfully create the session.
			 var group=groupList[message.group];  
		     group.buffer.push({ announcement:message.nick+' Joined'});
		
		     client.send({ buffer: group.buffer });
		     
  		     var temp=returnProperArray(message.group,client.sessionId);

  		     socket.broadcast({ announcement: message.nick +' joined' },temp);
  		     
	        }
	    }else{
			 //The message is in the format {nick:nick, value:value}
             var msg = { message: [message.nick, message.value] };
             
             var groupName=sessions[client.sessionId].group;
             var group=groupList[groupName];
             var temp=returnProperArray(groupName,client.sessionId);
             
		     group.buffer.push({message:[message.nick,message.value]});
			
			 //broadcast the message to all other clients except who are in other groups       
             socket.broadcast(msg,temp);
			 
        }
    });
  
  //When the connction is stoped(It commonly happens when you refresh the page or close the page.  
  client.on('disconnect', function(){
	
	var sessionTemp=sessions[client.sessionId];
	
	//When you reload the web page, the previous socket connection will be stoped
	//If you didn't submit anything by click join, then there is no related session.
	//So the sessionTemp may be null. So we need a if sentence.
	if(sessionTemp&&sessionTemp.group){
	  var group=groupList[sessionTemp.group];
	  
	  group.buffer.push({ announcement: sessionTemp.nick +' Left'});
	  
	  var temp=returnProperArray(sessionTemp.group,client.sessionId);

      socket.broadcast({ announcement: sessionTemp.nick +' left' },temp);
    
      //destroy the related session.
      sessionTemp.destroy;
   }
  });
});
