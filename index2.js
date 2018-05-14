const Discord = require('discord.js'); //npm discord
const client = new Discord.Client();
//var Promise = require("bluebird")
const token = 'NDMwNDUxNzY2ODU4MDg4NDQ4.DaQZfA.Uqb_Xff-pjSq_e2B-ProzzXdpo4';
//var mysql = require('promise-mysql'); //requires bluebird && promise-mysql && mysqljs
const cassandra = require('cassandra-driver');
const TimeUuid = require('cassandra-driver').types.TimeUuid;
const Long = require('cassandra-driver').types.Long;
var https = require('https');
var fs = require('fs');
var diff = require('arr-diff'); //requires arr-diff
const path = require('path');

var dbdone = false;

var pool;

var guild_lock = false;
var channel_lock = false;

const cass = new cassandra.Client({
  contactPoints: ['192.168.1.166']
});

function executeQueries(queries_batch, statusmsg) { //https://stackoverflow.com/questions/32028552/es6-promises-something-like-async-each/32040125?utm_medium=organic&utm_source=google_rich_qa&utm_campaign=google_rich_qa
  return new Promise(function(resolve, reject) {
    if (queries_batch.length > 0) {
        cass.batch(queries_batch, {prepare : true})
        .then(() => {
          resolve(statusmsg)
        })
        .catch(err => {
          //console.log(err);
          reject(err);
        })
    } else {
      //console.log('EMPTY QUERY!!')
      resolve('Qempty');
    }
  });

}

function parallelqry(query, params) {
  return new Promise(function(resolve, reject) {
    cass.execute(query, params, {
        prepare: true
      })
      .then(function(results) {
        resolve(results);
      })
      .catch(err => {
        reject(err);
      });
  });
}
/*-
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

*/
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
function createPool() {
  return new Promise(function(resolve, reject) {
    parallelqry("CREATE KEYSPACE IF NOT EXISTS discordlog WITH REPLICATION = {'class' : 'SimpleStrategy', 'replication_factor' : 1  };")
      .then(() => {
        return parallelqry("USE discordlog")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS guilds (guildid bigint, name varchar, available boolean, botispresent boolean, PRIMARY KEY (guildid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS categories (categoryid bigint, name varchar, guildid bigint, deleted boolean, PRIMARY KEY (categoryid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS channels (channelid bigint, name varchar, type varchar, categoryid bigint, guildid bigint, deleted boolean, PRIMARY KEY (channelid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS users (userid bigint, tag varchar, bot boolean, avatarurl varchar, avatarpath varchar, edited boolean, PRIMARY KEY (userid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS dmchannels(dmchannelid bigint, userid bigint, PRIMARY KEY(dmchannelid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS attachments(attachmentid bigint, path varchar, PRIMARY KEY (attachmentid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS dms(dmId bigint, content varchar, timestamp bigint, attachmentid bigint, dmchannelid bigint, edited boolean, PRIMARY KEY (dmid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS messages (messageid bigint, userid bigint, content varchar, timestamp bigint, attachmentid bigint, channelid bigint, edited boolean, PRIMARY KEY (messageid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS messages_edits (mexeditid timeuuid, oldcontent varchar, newcontent varchar, timestamp bigint, messageId bigint, PRIMARY KEY (mexeditid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS dms_edits (dmeditid timeuuid, oldcontent varchar, newcontent varchar, timestamp bigint, dmid bigint, PRIMARY KEY (dmeditid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS guilds_edits (guildeditid timeuuid, oldname varchar, newname varchar, guildid bigint, PRIMARY KEY (guildeditid))")
      })
      .then(() => {
        return parallelqry("CREATE INDEX IF NOT EXISTS ON guilds (botispresent)")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS channels_edits (channeleditid timeuuid, oldname varchar, newname varchar, oldcategoryid bigint, newcategoryid bigint, channelid bigint, PRIMARY KEY (channeleditid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS categories_edits (categoryeditid timeuuid, oldname varchar, newname varchar, categoryid bigint, PRIMARY KEY (categoryeditid))")
      })
      .then(() => resolve('CreatedPool'))
      .catch(err => {
        console.log(err);
        reject('Error creating Pool')
      });
  });
}

function handleUsers(user) {
  return new Promise(function(resolve, reject) {
    var avatarPath = path.resolve(__dirname, './avatars', user.id);
    var conn;
    parallelqry("INSERT INTO users (userid , tag, bot, avatarurl, edited) VALUES (?, ?, ?, ?, false) IF NOT EXISTS", [user.id, user.tag, user.bot, user.displayAvatarURL])
      .then(function() {
        return parallelqry("SELECT avatarurl, avatarpath FROM users WHERE userid = ?", [user.id]);
      })
      .then(results => {
        //console.log('RISULTATI :', results);
        let currentPath = results.rows[0].avatarpath;
        console.log(currentPath);
        let newPath;
        if (currentPath === null)
          newPath = path.resolve(avatarPath + "-0000" + ".png");
        else if (results.rows[0].avatarurl !== user.displayAvatarURL)
          newPath = path.resolve(avatarPath + "-" + ((parseInt((currentPath.substr(currentPath.length - 8)).substr(0, 4)) + 1).toString().padStart(4, "0")) + ".png");
        else
          newPath = "unchanged";

        if (newPath !== "unchanged") {
          return parallelqry("UPDATE users SET avatarurl = ?, avatarpath = ? WHERE userid = ?", [user.displayAvatarURL, newPath, user.id])
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
  });
}

function handleGuilds(client_guilds, action) {
  return new Promise(function(resolve, reject) {
    let guilds = [];
    let guilds_queries = [];
    let guilds_args = [];
    let queries_removedguilds = [];
    let args_removedguilds = [];

    if (action === 'initialize')
      guilds = client_guilds.array();
    else
      guilds = client_guilds;

    if (action === 'initialize' || action === 'add') {
      for (let i = 0; i < guilds.length; i++) {
        if (guilds[i].available) {
          guilds_queries.push({query:"INSERT INTO guilds (guildid, name, available) VALUES (?, ?, true) IF NOT EXISTS", params: [guilds[i].id, guilds[i].name]})
          guilds_queries.push({query:"UPDATE guilds SET botispresent = true WHERE guildid = ?", params: [guilds[i].id] })
        }
      }
    }
    executeQueries(guilds_queries,'doneWithInsertGuilds')
      .then(function handleGuildDeletes() {
        if (action === 'initialize') {
          return parallelqry("SELECT guildid FROM guilds WHERE botispresent = true")
            .then(results => {
              let allGuildsArr = [];
              let removedGuilds = [];
              for (let i = 0; i < results.rows.length; i++) {
                allGuildsArr.push(results.rows[i].guildid);
              }
              removedGuilds = diff(allGuildsArr, client_guilds.keyArray());
              for (let i = 0; i < removedGuilds.length; i++) {
                console.log('ciccio')
                queries_removedguilds.push({query:"UPDATE guilds SET botispresent = false WHERE guildid = ?", params: [removedGuilds[i]] });
              }
            })
        } else if (action === 'remove') {
          queries_removedguilds.push({query:"UPDATE guilds SET botispresent = false WHERE guildid = ?", params: [guilds[0].id] });
        }
      })
      .then(() => {
        return executeQueries(queries_removedguilds, 'doneWithDeleteGuilds')
      })
      .then(async function updateGuilds() {
        if (action === 'initialize' || action === 'update') {
          let queries2 = [];
          for (let i = 0; i < guilds.length; i++) {
            await parallelqry("SELECT name FROM guilds WHERE guildid = ?", [guilds[i].id])
              .then(results => {
                if (results.rows[0].name !== guilds[i].name) {
                  queries2.push({query: "INSERT INTO guilds_edits(guildeditid, oldname, newname, guildid) VALUES (?, ?, ?, ?);", params: [TimeUuid.now(), results.rows[0].name, guilds[i].name, guilds[i].id]});
                  queries2.push({query: "UPDATE guilds SET Name = ? WHERE guildid = ?", params: [guilds[i].name, guilds[i].id]});
                }
              })
          }
          return executeQueries(queries2, 'doneWithUpdateGuild')
            .then(status => {
              resolve(status);
            })
        } else {
          resolve('doneHandleGuild_NoUpdate');
        }
      })
      .catch(err => {
        reject(err)
      })
  });
}
/*
function handleChannels(client_channels, action, connection) {
  return new Promise(function(resolve, reject) {
    let temp_conn = null;
    let channel_queries = [];
    let channel_args = [];
    let queries_removedchans = [];
    let args_removedchans = [];
    let channels = [];
    if (action === 'initialize')
      channels = client_channels.array();
    else
      channels = client_channels;

    if (typeof conn !== 'undefined')
      conn = connection;
    if (action === 'initialize' || action === 'create') {
      for (let i = 0; i < channels.length; i++) {
        let channel = channels[i];
        if (channels[i].type === 'category') {
          channel_queries.push("INSERT INTO categories (CategoryId, Name, GuildId) SELECT * FROM (SELECT ?, ?, ? ) AS tmp WHERE NOT EXISTS (SELECT CategoryId FROM categories WHERE CategoryId = ? ) LIMIT 1;");
          channel_args.push([channel.id, channel.name, channel.guild.id, channel.id]);
        } else if (channels[i].type !== 'dm') {
          let parentchan;
          if (channels[i].parentID !== null && channels[i].parentID !== undefined) {
            parentchan = channels[i].guild.channels.get(channels[i].parentID);
            channel_queries.push("INSERT INTO categories (CategoryId, Name, GuildId) SELECT * FROM (SELECT ?, ?, ? ) AS tmp WHERE NOT EXISTS (SELECT CategoryId FROM categories WHERE CategoryId = ? ) LIMIT 1;")
            channel_args.push([parentchan.id, parentchan.name, parentchan.guild.id, parentchan.id]);
          }
          channel_queries.push("INSERT INTO channels (ChannelId, Name, Type, CategoryId, GuildId) SELECT * FROM (SELECT ?, ?, ?, ?, ? ) AS tmp WHERE NOT EXISTS (SELECT ChannelId FROM channels WHERE ChannelId = ? ) LIMIT 1;");
          channel_args.push([channel.id, channel.name, channel.type, channel.parentID, channel.guild.id, channel.id]);
        }
      }
    }
    executeQueries(channel_queries, channel_args, 'doneWithInsertChannels')
      .then(() => {
        return pool.getConnection()
      })
      .then(gotConn => {
        temp_conn = gotConn;
      })
      .then(function handleChannelDeletes() {
        if (action === 'initialize') {
          return parallelqry(temp_conn, "SELECT CAST(ChannelId AS CHAR) as ChannelId FROM channels WHERE Deleted IS NULL")
            .then(results => {
              let removedchannelarr = [];
              let removedchannels = [];
              for (let i = 0; i < results.length; i++) {
                removedchannelarr.push(results[i].ChannelId);
              }
              removedchannels = diff(removedchannelarr, client_channels.keyArray());
              for (let i = 0; i < removedchannels.length; i++) {
                queries_removedchans.push("UPDATE channels SET Deleted = 1 WHERE ChannelId = ?");
                args_removedchans.push([removedchannels[i]]);
              }
              return removedchannels;
            })
            .then(() => {
              return parallelqry(temp_conn, "SELECT CAST(CategoryId AS CHAR) as CategoryId FROM categories WHERE Deleted IS NULL")
                .then(results => {
                  let removedcategoriesarr = [];
                  let removedcategories = [];
                  for (let i = 0; i < results.length; i++) {
                    removedcategoriesarr.push(results[i].CategoryId);
                  }
                  removedcategories = diff(removedcategoriesarr, client_channels.keyArray());
                  for (let i = 0; i < removedcategories.length; i++) {
                    queries_removedchans.push("UPDATE categories SET Deleted = 1 WHERE CategoryId = ?")
                    args_removedchans.push([removedcategories[i]]);
                  }
                  return removedcategories;
                })
            })
        } else if (action === 'delete') {
          queries_removedchans.push("UPDATE categories SET Deleted = 1 WHERE CategoryId = ?; UPDATE channels SET Deleted = 1 WHERE ChannelId = ?");
          args_removedchans.push([channels[0].id, channels[0].id]);
        }
      })
      .then(() => {
        return executeQueries(queries_removedchans, args_removedchans, 'doneWithRemovedChannels')
      })
      .then(async function updateChannels() {
        let queries2 = [];
        let args2 = [];
        for (let i = 0; i < channels.length; i++) {
          if (channels[i].type === 'category') {
            await parallelqry(temp_conn, "SELECT Name FROM categories WHERE CategoryId = ?", channels[i].id)
              .then(results => {
                if (results[0].Name !== channels[i].name) {
                  queries2.push("INSERT INTO categories_edits(OldName, NewName, CategoryId) VALUES (?, ?, ?); UPDATE categories SET Name = ? WHERE CategoryId = ?");
                  args2.push([results[0].Name, channels[i].name, channels[i].id, channels[i].name, channels[i].id]);
                }
              });
          } else if (channels[i].type !== 'dm') {
            await parallelqry(temp_conn, "SELECT Name,CAST(CategoryId AS CHAR) as CategoryId FROM channels WHERE ChannelId = ?", channels[i].id) //CategoryId is too big for node ints, needs to be retrieved as a string
              .then(results => {
                if ((results[0].Name !== channels[i].name) || (results[0].CategoryId !== channels[i].parentID)) {
                  queries2.push("INSERT INTO channels_edits(OldName, NewName, OldCategoryId, NewCategoryId, ChannelId) VALUES (?, ?, ?, ?, ?); UPDATE channels SET Name = ?, CategoryId = ? WHERE ChannelId = ?");
                  args2.push([results[0].Name, channels[i].name, results[0].CategoryId, channels[i].parentID, channels[i].id, channels[i].name, channels[i].parentID, channels[i].id]);
                }
              });
          }
        }
        return executeQueries(queries2, args2, 'doneHandleChannel')
          .then(status => {
            temp_conn.release();
            resolve(status);
          })
      })
      .catch(err => {
        if (temp_conn !== null)
          temp_conn.release();
        reject(err)
      })
  });
}
*/

function populatedb() {
  return new Promise(function(resolve, reject) {
    var client_users = client.users.array();
    //var client_guilds = client.guilds.array();
    //var client_channels = client.channels.array();
    Promise.resolve()
      .then(async function users() {
        for (let i = 0; i < client_users.length; i++) {
          await handleUsers(client_users[i]);
        }
      })

      .then(function guilds() {
        return handleGuilds(client.guilds, 'initialize');
      })
      /*
            .then(function channels() {
              return handleChannels(client.channels, 'initialize');
            })*/
      .then(function doneWithPopulate() {
        console.log('doneWithPopulate')
        resolve('doneWithPopulate');
      })
      .catch(err => {
        reject(err);
      })
  });
}

/*
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

function updateMessage(oldmsg, newmsg) {
  return new Promise(function(resolve, reject) {

    let array_commands = [];
    let array_args = [];
    let temp_conn, statusmsg;
    if (newmsg.channel.type === 'text') {
      array_commands = ["UPDATE messages SET Content = ?, Edited = 1 WHERE MessageId = ?", "INSERT INTO messages_edits (OldContent, NewContent, Timestamp, MessageId ) VALUES (?, ?, ?, ?)"];
      array_args = [
        [newmsg.cleanContent, oldmsg.id],
        [oldmsg.cleanContent, newmsg.cleanContent, newmsg.editedTimestamp, newmsg.id]
      ];
      statusmsg = 'doneWithUpdateMex';
    } else if (newmsg.channel.type === 'dm') {
      array_commands = ["UPDATE dms SET Content = ?, Edited = 1 WHERE DmId = ?", "INSERT INTO dms_edits (OldContent, NewContent, Timestamp, DmId ) VALUES (?, ?, ?, ?)"];
      array_args = [
        [newmsg.cleanContent, oldmsg.id],
        [oldmsg.cleanContent, newmsg.cleanContent, newmsg.editedTimestamp, newmsg.id]
      ];
      statusmsg = 'doneWithUpdateDm';
    }
    executeQueries(array_commands, array_args, statusmsg)
      .then(status => resolve(status))
      .catch(err => reject(err));

  });
}

*/

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
  channelCreate !!!
  channelDelete !!!
  channelUpdate !!!
  guildCreate
  guildDelete
  guildMemberAdd !!?
  guildMemberUpdate ???
  guildUpdate
  message !!!
  messageDelete
  messageDeleteBulk
  messageUpdate !!!
  ready !!!
  resume
  userUpdate ???

*/

/*client.on('channelCreate', channel => {
  if (dbdone) {
    channel_lock = true;
    if (guild_lock) {
      setTimeout(handleChannels([channel], 'create')
        .then(statusmsg => console.log('channelCreate', statusmsg))
        .catch(err => console.log("Error in 'channelCreate' function_1\n", err)), 5000)
    } else {
      handleChannels()
        .then(statusmsg => console.log('channelCreate', statusmsg))
        .catch(err => console.log("Error in 'channelCreate' function_2\n", err));
    }
  }
});

client.on('channelUpdate', function(oldchannel, newchannel) {
  if (dbdone) {
    handleChannels([newchannel], 'update')
      .then(statusmsg => {
        if (statusmsg !== 'Qempty')
          console.log('channelUpdate', statusmsg)
      })
      .catch(err => console.log("Error in 'channelUpdate' function\n", err));
  }
});

client.on('channelDelete', channel => {
  if (dbdone) {
    handleChannels([channel], 'delete')
      .then(statusmsg => {
        if (statusmsg !== 'Qempty')
          console.log('channelDelete', statusmsg)
      })
      .catch(err => console.log("Error in 'channelDelete' function\n", err));
  }
})
*/

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  createPool()
    .then(() => {
      return populatedb();
    })
    .then(function donePopulate() {
      dbdone = true;
    })
    .catch(err => {
      console.log("Error in 'ready' function\n", err);
    });
});

/*
client.on('message', msg => {
  if (dbdone) {
    if (channel_lock || guild_lock) {
      setTimeout(processMsg(msg)
        .then(status => console.log("Status: " + status))
        .catch(err => console.log("Error in 'message' function\n", err)), 10000)
    } else {
      processMsg(msg)
        .then(status => console.log("Status: " + status))
        .catch(err => console.log("Error in 'message' function\n", err))
    }

  } else {
    console.log("DB not ready");
  }
});


client.on('messageUpdate', function(oldmsg, newmsg) {
  if (dbdone) {
    updateMessage(oldmsg, newmsg)
      .then(statusmsg => console.log('msgup' + statusmsg))
      .catch(err => console.log("Error in 'updateMessage' function\n", err));
  }
});


client.on('guildMemberAdd', function(member) {
  handleUsers(member.user, function(err, result) {
    console.log(result);
  });
});

client.on('guildCreate', guild => {
  if (dbdone) {
    guild_lock = true;
    handleGuilds([guild], 'add')
      .then(statusmsg => {
        if (statusmsg !== 'Qempty')
          console.log('guildCreate', statusmsg)
      })
      .catch(err => console.log("Error in 'guildCreate' function\n", err));
  }
})

client.on('guildDelete', guild => {
  if (dbdone) {
    handleGuilds([guild], 'delete')
      .then(statusmsg => {
        if (statusmsg !== 'Qempty')
          console.log('guildDelete: ', statusmsg)
      })
      .catch(err => console.log("Error in 'guildDelete' function\n", err));
  }
})

client.on('userUpdate', function(oldmsg, newmsg) {
  console.log("Fired userUpdate");
});
*/

client.login(token);
