const Discord = require('discord.js'); //npm discord
const client = new Discord.Client();
const token = 'NDMwNDUxNzY2ODU4MDg4NDQ4.DaQZfA.Uqb_Xff-pjSq_e2B-ProzzXdpo4';
//var async = require('async');
var mysql = require('promise-mysql'); //requires bluebird && promise-mysql && mysqljs
var https = require('https');
var fs = require('fs');
const path = require('path');

var dbdone = false;

var pool;

function executeQueries(queries_array, args, statusmsg){ //https://stackoverflow.com/questions/32028552/es6-promises-something-like-async-each/32040125?utm_medium=organic&utm_source=google_rich_qa&utm_campaign=google_rich_qa
  return new Promise(function (resolve, reject){
    let conn;
    pool.getConnection()
    .then( connection => {
      conn = connection;
      return queries_array.reduce(function(promise, query, index) {
        return promise.then( results => {
            return parallelqry(conn, query, args[index])
        })
      }, Promise.resolve());
    })
    .then(() => resolve(statusmsg))
    .catch(err => {
      reject(err);
    })
    .finally( () => {
      if(conn)
        conn.release();
    })

  });

}

function parallelqry(connector, query, params) {
  return new Promise(function(resolve, reject) {
    connector.query(query, params)
      .then(function(results) {
        resolve(results);
      })
      .catch(err => {
        //console.error(err);
        reject(err);
      });
  });
}

async function fastqry(query, params) {
  return new Promise(function(resolve, reject) {
    var connection;
    pool.getConnection()
      .then(conn => {
        connection = conn;
        return parallelqry(conn, query, params);
      })
      .then(results => {
        resolve(results);
      })
      .catch(err => {
        reject(err);
      })
      .finally(function() {
        connection.release();
      });
  });
}

function download(file_savedest, url) { //https://stackoverflow.com/questions/10343951/http-get-loop-to-download-list-of-files/10343976
  https.get(url, function(res) {
    var imagedata = '';
    res.setEncoding('binary');

    res.on('data', function(chunk) {
      imagedata += chunk
    });

    res.on('end', function() {
      fs.writeFile(file_savedest, imagedata, 'binary', function(err) {
        if (err) {
          console.log(err);
        } else {
          console.log("File:" + file_savedest + " saved");
        }
      });
    });
  });
}

//Multiple statements query to ensure synchrony
let temp_conn;
mysql.createConnection({
    host: '192.168.1.166',
    user: 'griefer',
    password: 'porcodio',
    multipleStatements: true,
    charset: "utf8mb4_unicode_520_ci"
  })
  .then(connection => {
    temp_conn = connection;
    return parallelqry(temp_conn, "CREATE DATABASE IF NOT EXISTS discordlog DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_520_ci")
  })
  .then(() => {return parallelqry(temp_conn, "USE discordlog")})
  .then(() => {return parallelqry(temp_conn, "CREATE TABLE IF NOT EXISTS guilds (GuildId bigint, Name varchar(102), Available boolean, PRIMARY KEY (GuildId))")})
  .then(() => {return parallelqry(temp_conn, "CREATE TABLE IF NOT EXISTS categories (CategoryId bigint, Name varchar(102), GuildId bigint, PRIMARY KEY (CategoryId), FOREIGN KEY (GuildId) REFERENCES guilds(GuildId))")})
  .then(() => {return parallelqry(temp_conn, "CREATE TABLE IF NOT EXISTS channels (ChannelId bigint, Name varchar(102), Type varchar(10), CategoryId bigint, GuildId bigint, PRIMARY KEY (ChannelId), FOREIGN KEY (CategoryId) REFERENCES categories(CategoryId), FOREIGN KEY (GuildId) REFERENCES guilds(GuildId))")})
  .then(() => {return parallelqry(temp_conn, "CREATE TABLE IF NOT EXISTS users (UserId bigint, Tag varchar(40), Bot boolean, AvatarUrl varchar(10000), AvatarPath varchar(500), Edited boolean, PRIMARY KEY (UserId))")})
  .then(() => {return parallelqry(temp_conn, "CREATE TABLE IF NOT EXISTS dmchannels(DmChannelId bigint, UserId bigint, PRIMARY KEY(DmChannelId), FOREIGN KEY (UserId) REFERENCES users(UserId))")})
  .then(() => {return parallelqry(temp_conn, "CREATE TABLE IF NOT EXISTS attachments(AttachmentId bigint, Path varchar(500), PRIMARY KEY (AttachmentId))")})
  .then(() => {return parallelqry(temp_conn, "CREATE TABLE IF NOT EXISTS dms(DmId bigint, Content varchar(2010), Timestamp bigint, AttachmentId bigint, DmChannelId bigint, Edited boolean, PRIMARY KEY (DmId), FOREIGN KEY (DmChannelId) REFERENCES dmchannels (DmChannelId), FOREIGN KEY (AttachmentId) REFERENCES attachments(AttachmentId))")})
  .then(() => {return parallelqry(temp_conn, "CREATE TABLE IF NOT EXISTS messages (MessageId bigint, UserId bigint, Content varchar(2010), Timestamp bigint, AttachmentId bigint, ChannelId bigint, Edited boolean, PRIMARY KEY (MessageId), FOREIGN KEY (UserId) REFERENCES users(UserId), FOREIGN KEY (AttachmentId) REFERENCES attachments(AttachmentId), FOREIGN KEY (ChannelId) REFERENCES channels(ChannelId))")})
  .then(() => {return parallelqry(temp_conn, "CREATE TABLE IF NOT EXISTS messages_edits (MexEditId bigint NOT NULL AUTO_INCREMENT, OldContent varchar(2010), NewContent varchar(2010), Timestamp bigint, MessageId bigint, PRIMARY KEY (MexEditId), FOREIGN KEY (MessageId) REFERENCES messages(MessageId))")})
  .then(() => {return parallelqry(temp_conn, "CREATE TABLE IF NOT EXISTS dms_edits (DmEditId bigint NOT NULL AUTO_INCREMENT, OldContent varchar(2010), NewContent varchar(2010), Timestamp bigint, DmId bigint, PRIMARY KEY (DmEditId), FOREIGN KEY (DmId) REFERENCES dms(DmId))")})
  .then(function createPool() {
    pool = mysql.createPool({
      host: '192.168.1.166',
      user: 'griefer',
      password: 'porcodio',
      database: 'discordlog',
      multipleStatements: true,
      connectionLimit: 20,
      charset: "utf8mb4_unicode_520_ci"
    });
  })
  .catch(err => {
    console.log('errore creazione database' + err);
  })
  .finally(function release() {
    if (temp_conn)
      temp_conn.end();
    delete temp_conn;
  });

async function handleUsers(user) {
  return new Promise(function(resolve, reject) {
    var avatarPath = path.resolve(__dirname, './avatars', user.id);
    var conn;
    pool.getConnection()
      .then(connection => {
        conn = connection;
        return parallelqry(conn, "INSERT INTO users (UserId , Tag, Bot, AvatarUrl, Edited) SELECT * FROM (SELECT ?, ?, ?, ?, 0 ) AS tmp WHERE NOT EXISTS (SELECT UserId FROM users WHERE UserId = ? ) LIMIT 1;", [user.id, user.tag, user.bot, user.displayAvatarURL, user.id])
      })
      .then(function() {
        return parallelqry(conn, "SELECT AvatarUrl, AvatarPath FROM users WHERE UserId = ?", user.id);
      })
      .then(results => {
        let currentPath = results[0].AvatarPath;
        let newPath;

        if (currentPath === null)
          newPath = path.resolve(avatarPath + "-0000" + ".png");
        else if (results[0].AvatarUrl !== user.displayAvatarURL)
          newPath = path.resolve(avatarPath + "-" + ((parseInt((currentPath.substr(currentPath.length - 8)).substr(0, 4)) + 1).toString().padStart(4, "0")) + ".png");
        else
          newPath = "unchanged";

        if (newPath !== "unchanged") {
          return parallelqry(conn, "UPDATE users SET AvatarUrl = ?, AvatarPath = ? WHERE UserId = ?", [user.displayAvatarURL, newPath, user.id])
            .then(function() {
              download(newPath, user.displayAvatarURL);
              return 'aggiornato';
            })
            .catch(err => {
              console.log(err);
              return 'err';
            });
        } else {
          return 'unchanged';
        }
      })
      .then(status => {
        if (status !== 'err') {
          resolve(status);
        } else {
          reject(status);
        }
      })
      .catch(err => {
        console.log(err);
        reject(err);
      })
      .finally(function release() {
        if (conn)
          conn.release();
      });
  });
}

function populatedb() {
  return new Promise(function(resolve, reject) {
    var client_users = client.users.array();
    var client_guilds = client.guilds.array();
    var client_channels = client.channels.array();
    var conn;
    pool.getConnection()
      .then(connection => {
        conn = connection;
      })
      .then(async function users() {
        for (let i = 0; i < client_users.length; i++) {
          await handleUsers(client_users[i]);
        }
      })
      .then(function guilds() {
        let promise_guilds = [];
        for (let i = 0; i < client_guilds.length; i++) {
          let guild = client_guilds[i];
          if (guild.available)
            promise_guilds.push(parallelqry(conn, "INSERT INTO guilds (GuildId, Name, Available) SELECT * FROM (SELECT ?, ?, 1 ) AS tmp WHERE NOT EXISTS (SELECT GuildId FROM guilds WHERE GuildId = ? ) LIMIT 1;", [guild.id, guild.name, guild.id]));
        }
        return Promise.all(promise_guilds);
      })
      .then(function channels() {
        let promise_channels = [];
        for (let i = 0; i < client_channels.length; i++) {
          let channel = client_channels[i];
          if (channel.type === 'category')
            promise_channels.push(parallelqry(conn, "INSERT INTO categories (CategoryId, Name, GuildId) SELECT * FROM (SELECT ?, ?, ? ) AS tmp WHERE NOT EXISTS (SELECT CategoryId FROM categories WHERE CategoryId = ? ) LIMIT 1;", [channel.id, channel.name, channel.guild.id, channel.id]));
          else if (channel.type === 'dm')
            promise_channels.push(parallelqry(conn, "INSERT INTO dmchannels (DmId, UserId) SELECT * FROM (SELECT ?, ? ) AS tmp WHERE NOT EXISTS (SELECT DmId FROM dmchannels WHERE DmId = ? ) LIMIT 1;", [channel.id, channel.recipient.id]));
          else
            promise_channels.push(parallelqry(conn, "INSERT INTO channels (ChannelId, Name, Type, CategoryId, GuildId) SELECT * FROM (SELECT ?, ?, ?, ?, ? ) AS tmp WHERE NOT EXISTS (SELECT ChannelId FROM channels WHERE ChannelId = ? ) LIMIT 1;", [channel.id, channel.name, channel.type, channel.parentID, channel.guild.id, channel.id]));
        }
        return Promise.all(promise_channels);
      })
      .then(function doneWithPopulate() {
        console.log('doneWithPopulate')
        resolve('doneWithPopulate');
      })
      .catch(err => {
        reject(err);
      })
      .finally(function release() {
        if (conn)
          conn.release();
      });
  });
}

function processMsg(msg) {
  return new Promise(function(resolve, reject) {
    if (msg.attachments.array().length > 0) {
      var filenameext = msg.attachments.first().filename;
      var n = filenameext.lastIndexOf(".");
      var attachPath = path.resolve(__dirname, './attachments', (filenameext.substring(0, n) + "-" + msg.attachments.first().id.toString() + filenameext.substring(n)));
      download(attachPath, msg.attachments.first().url);
      if (msg.channel.type === 'text') {
        fastqry("INSERT INTO attachments (AttachmentId, Path) VALUES (?, ?); INSERT INTO messages (MessageId, UserId, Content, Timestamp, AttachmentId, ChannelId ) VALUES (?, ?, ?, ?, ?, ?) ", [msg.attachments.first().id, attachPath, msg.id, msg.author.id, msg.cleanContent, msg.createdTimestamp, msg.attachments.first().id, msg.channel.id])
          .then(() => resolve('doneWithAttachMex'))
          .catch(err => reject(err));
      } else if (msg.channel.type === 'dm') {
        handleUsers(msg.channel.recipient)
          .then(() => {
            return fastqry("INSERT INTO attachments (AttachmentId, Path) VALUES (?, ?); INSERT INTO dmchannels (DmChannelId, UserId) SELECT * FROM (SELECT ?, ?) AS tmp WHERE NOT EXISTS (SELECT DmChannelId FROM dmchannels WHERE DmChannelId = ? ) LIMIT 1; INSERT INTO dms (DmId, Content, Timestamp, AttachmentId, DmChannelId ) VALUES (?, ?, ?, ?, ?)", [msg.attachments.first().id, attachPath, msg.channel.id, msg.channel.recipient.id, msg.channel.id, msg.id, msg.cleanContent, msg.createdTimestamp, msg.attachments.first().id, msg.channel.id])
          })
          .then(() => resolve('doneWithAttachDm'))
          .catch(err => reject(err));
      }
    } else {
      if (msg.channel.type === 'text') {
        fastqry("INSERT INTO messages (MessageId, UserId, Content, Timestamp, ChannelId ) VALUES (?, ?, ?, ?, ?)", [msg.id, msg.author.id, msg.cleanContent, msg.createdTimestamp, msg.channel.id])
          .then(() => resolve('doneWithTextMex'))
          .catch(err => reject(err));
      } else if (msg.channel.type === 'dm') {
        handleUsers(msg.channel.recipient)
          .then(() => {
            return fastqry("INSERT INTO dmchannels (DmChannelId, UserId) SELECT * FROM (SELECT ?, ?) AS tmp WHERE NOT EXISTS (SELECT DmChannelId FROM dmchannels WHERE DmChannelId = ? ) LIMIT 1; INSERT INTO dms (DmId, Content, Timestamp, DmChannelId ) VALUES (?, ?, ?, ?)", [msg.channel.id, msg.channel.recipient.id, msg.channel.id, msg.id, msg.cleanContent, msg.createdTimestamp, msg.channel.id])
          })
          .then(() => resolve('doneWithTextDm'))
          .catch(err => reject(err));
      }
    }
  });
}

function updateMessage(oldmsg, newmsg){
  return new Promise(function(resolve, reject){

    let array_commands = [];
    let array_args = [];
    let temp_conn, statusmsg;
    if (newmsg.channel.type === 'text'){
      array_commands = ["UPDATE messages SET Content = ?, Edited = 1 WHERE MessageId = ?", "INSERT INTO messages_edits (OldContent, NewContent, Timestamp, MessageId ) VALUES (?, ?, ?, ?)"];
      array_args = [ [newmsg.cleanContent, oldmsg.id], [oldmsg.cleanContent, newmsg.cleanContent, newmsg.editedTimestamp, newmsg.id] ];
      statusmsg = 'doneWithUpdateMex';
    }else if (newmsg.channel.type === 'dm'){
      array_commands = ["UPDATE dms SET Content = ?, Edited = 1 WHERE DmId = ?", "INSERT INTO dms_edits (OldContent, NewContent, Timestamp, DmId ) VALUES (?, ?, ?, ?)"];
      array_args = [ [newmsg.cleanContent, oldmsg.id], [oldmsg.cleanContent, newmsg.cleanContent, newmsg.editedTimestamp, newmsg.id] ];
      statusmsg = 'doneWithUpdateDm';
    }
    executeQueries(array_commands, array_args, statusmsg)
    .then( status => resolve(status))
    .catch( err => reject(err));

  });
}

/* TODO:
-SETTARE A 500 LE CLIENT OPTIONS PER I MESSAGE LIFETIME;
-Se Gabri manda più di x messaggi più corti di y lettere in z tempo,  KICK ABBUSO PORKADDIO;
-Chat Log;
-Se spacy dice forse, spam di @spacy DECIDITI!
-Citazioni;
-Memebot per Spacy, priority -1;
- Auto add song playlist yt
-Bestemmie;
-un comando "shittyjoke" e ogni volta che lo scrivi scrive shittyjoke.estensionerandom
*/

if (!fs.existsSync(path.resolve(__dirname, './avatars'))) {
  fs.mkdirSync(path.resolve(__dirname, './avatars'));
}
if (!fs.existsSync(path.resolve(__dirname, './attachments'))) {
  fs.mkdirSync(path.resolve(__dirname, './attachments'));
}


/*EVENTS TO HANDLE
  channelCreate
  channelDelete
  channelUpdate ----
  guildCreate
  guildDelete
  guildMemberAdd
  guildUpdate ----
  guildMemberUpdate ???
  guildUpdate ----
  message
  messageDelete
  messageDeleteBulk
  messageUpdate
  ready
  resume
  userUpdate ???

*/

client.on('channelCreate', channel => {
  if (dbdone) {

  }
});

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  populatedb()
    .then(function donePopulate() {
      dbdone = true;
    })
    .catch(err => {
      console.log("Error in 'ready' function\n", err);
    });
});

client.on('message', msg => {
  if (dbdone) {
    processMsg(msg)
      .then(status => {
        console.log("Status: " + status);
      })
      .catch(err => {
        console.log("Error in 'message' function\n", err)
      });
  } else {
    console.log("DB not ready");
  }
});


client.on('messageUpdate', function(oldmsg, newmsg) {
  if (dbdone) {
    updateMessage(oldmsg, newmsg)
    .then( statusmsg => console.log(statusmsg))
    .catch(err => console.log("Error in 'updateMessage' function\n", err));
    }
});

/*
client.on('channelUpdate', function(oldmsg, newmsg) {
  console.log("Fired channelUpdate");
});

client.on('guildMemberAdd', function(member) {
  handleUsers(member.user, function(err, result) {
    console.log(result);
  });
});

client.on('userUpdate', function(oldmsg, newmsg) {
  console.log("Fired userUpdate");
});*/

client.login(token);
