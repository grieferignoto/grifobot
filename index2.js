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
      cass.batch(queries_batch, {
          prepare: true
        })
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
        return parallelqry("CREATE TABLE IF NOT EXISTS channels (channelid bigint, name varchar, type varchar, categoryid bigint, guildid bigint, deleted boolean,  PRIMARY KEY (channelid))")
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
        return parallelqry("CREATE TABLE IF NOT EXISTS channels_edits (channeleditid timeuuid, oldname varchar, newname varchar, oldcategoryid bigint, newcategoryid bigint, channelid bigint, PRIMARY KEY (channeleditid))")
      })
      .then(() => {
        return parallelqry("CREATE TABLE IF NOT EXISTS categories_edits (categoryeditid timeuuid, oldname varchar, newname varchar, categoryid bigint, PRIMARY KEY (categoryeditid))")
      })
      .then(() => {
        return parallelqry("CREATE INDEX IF NOT EXISTS ON guilds (botispresent)")
      })
      .then(() => {
        return parallelqry("CREATE INDEX IF NOT EXISTS ON categories (deleted)")
      })
      .then(() => {
        return parallelqry("CREATE INDEX IF NOT EXISTS ON channels (deleted)")
      })
      /*.then(() => {
        return parallelqry("CREATE INDEX IF NOT EXISTS ON channels (guildid)")
      })
      .then(() => {
        return parallelqry("CREATE INDEX IF NOT EXISTS ON categories (guildid)")
      })*/
      .then(() => resolve('CreatedPool'))
      .catch(err => {
        console.log(err);
        reject('Error creating Pool')
      });
  });
}

function handleUsers(client_users, action) {
  return new Promise(function(resolve, reject) {
    let promises1 = [];
    let promises2 = [];

    if (action === 'initialize')
      users = client_users.array();
    else
      users = client_users;

    if (action === 'initialize' || action === 'insert') {
      for (let i = 0; i < users.length; i++) {
        promises1.push(parallelqry("INSERT INTO users (userid , tag, bot, avatarurl, edited) VALUES (?, ?, ?, ?, false) IF NOT EXISTS", [users[i].id, users[i].tag, users[i].bot, users[i].displayAvatarURL]));
      }
    }
    Promise.all(promises1)
      .then(async function updateUsers() {
        if (action === 'initialize' || action === 'update') {
          for (let i = 0; i < users.length; i++) {
            var avatarPath = path.resolve(__dirname, './avatars', users[i].id);
            await parallelqry("SELECT avatarurl, avatarpath FROM users WHERE userid = ?", [users[i].id])
              .then(results => {
                let currentPath = results.rows[0].avatarpath;
                let newPath;
                if (currentPath === null)
                  newPath = path.resolve(avatarPath + "-0000" + ".png");
                else if (results.rows[0].avatarurl !== users[i].displayAvatarURL)
                  newPath = path.resolve(avatarPath + "-" + ((parseInt((currentPath.substr(currentPath.length - 8)).substr(0, 4)) + 1).toString().padStart(4, "0")) + ".png");
                else
                  newPath = "unchanged";

                if (newPath !== "unchanged") {
                  promises2.push(parallelqry("UPDATE users SET avatarurl = ?, avatarpath = ? WHERE userid = ?", [users[i].displayAvatarURL, newPath, users[i].id]));
                  download(newPath, users[i].displayAvatarURL);
                }
              });
          }
          return Promise.all(promises2)
            .then(status => {
              resolve(status);
            })
        } else {
          resolve('doneHandleUser_NoUpdate');
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
    let queries_removedguilds = [];

    if (action === 'initialize')
      guilds = client_guilds.array();
    else
      guilds = client_guilds;

    if (action === 'initialize' || action === 'add') {
      for (let i = 0; i < guilds.length; i++) {
        if (guilds[i].available) {
          guilds_queries.push(parallelqry("INSERT INTO guilds (guildid, name, available, botispresent) VALUES (?, ?, true, true) IF NOT EXISTS", [guilds[i].id, guilds[i].name])
            .then(() => {
              return parallelqry("UPDATE guilds SET botispresent = true WHERE guildid = ?", [guilds[i].id]);
            }));
        }
      }
    }
    Promise.all(guilds_queries)
      .then(function handleGuildDeletes() {
        if (action === 'initialize') {
          return parallelqry("SELECT guildid FROM guilds WHERE botispresent = true")
            .then(results => {
              //console.log(results.rows[0].guildid)
              let allGuildsArr = [];
              let removedGuilds = [];
              for (let i = 0; i < results.rows.length; i++) {
                allGuildsArr.push(results.rows[i].guildid.toString()); // Object Long is returned, cast to string
              }
              removedGuilds = diff(allGuildsArr, client_guilds.keyArray());
              for (let i = 0; i < removedGuilds.length; i++) {
                queries_removedguilds.push(parallelqry("UPDATE guilds SET botispresent = false WHERE guildid = ?", [removedGuilds[i]]));
              }
            })
        } else if (action === 'remove') {
          queries_removedguilds.push(parallelqry("UPDATE guilds SET botispresent = false WHERE guildid = ?", [guilds[0].id]));
        }
      })
      .then(() => {
        return Promise.all(queries_removedguilds)
      })
      .then(async function updateGuilds() {
        if (action === 'initialize' || action === 'update') {
          let queries2 = [];
          for (let i = 0; i < guilds.length; i++) {
            await parallelqry("SELECT name FROM guilds WHERE guildid = ?", [guilds[i].id])
              .then(results => {
                if (results.rows[0].name !== guilds[i].name) {
                  queries2.push(parallelqry("INSERT INTO guilds_edits(guildeditid, oldname, newname, guildid) VALUES (?, ?, ?, ?);", [TimeUuid.now(), results.rows[0].name, guilds[i].name, guilds[i].id])
                    .then(() => {
                      return parallelqry("UPDATE guilds SET Name = ? WHERE guildid = ?", [guilds[i].name, guilds[i].id])
                    }));

                }
              })
          }
          return Promise.all(queries2)
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

function handleChannels(client_channels, action) {
  return new Promise(function(resolve, reject) {
    let temp_conn = null;
    let promises1 = [];
    let channel_args = [];
    let queries_removedchans = [];
    let args_removedchans = [];
    let channels = [];

    if (action === 'initialize' || action === 'guild' || action === 'guild_delete')
      channels = client_channels.array();
    else
      channels = client_channels;

    if (action === 'initialize' || action === 'create') {
      for (let i = 0; i < channels.length; i++) {
        let channel = channels[i];
        if (channels[i].type === 'category') {
          promises1.push(parallelqry("INSERT INTO categories (categoryid, name, guildid) VALUES ( ?, ?, ?) IF NOT EXISTS", [channel.id, channel.name, channel.guild.id])
            .then(() => {
              return parallelqry("UPDATE categories SET deleted = false WHERE categoryid = ?", [channel.id])
            }))
        } else if (channels[i].type !== 'dm') {
          promises1.push(parallelqry("INSERT INTO channels (channelid, name, type, categoryid, guildid) VALUES ( ?, ?, ?, ?, ?) IF NOT EXISTS", [channel.id, channel.name, channel.type, channel.parentID, channel.guild.id])
            .then(() => {
              return parallelqry("UPDATE channels SET deleted = false WHERE channelid = ?", [channel.id])
            }))
        }
      }
    }
    Promise.all(promises1)
      .then(function handleChannelDeletes() {
        if (action === 'initialize' || action === 'guild') {
          let temp_query1;
          let temp_query2 = [];
          if(action === 'initialize'){
            temp_query1 = parallelqry("SELECT channelid FROM channels WHERE deleted = false")
          }
          else {
            temp_query1 = parallelqry("SELECT channelid FROM channels WHERE deleted = false AND guildid = ? ALLOW FILTERING", [channels[0].id]) //ALLOW FILTERING BECAUSE NO PRIMARY KEY https://docs.datastax.com/en/cql/3.3/cql/cql_using/useMultIndexes.html
          }
          Promise.resolve(temp_query1)
            .then(results => {
              let removedchannelarr = [];
              let removedchannels = [];
              for (let i = 0; i < results.rows.length; i++) {
                removedchannelarr.push(results.rows[i].channelid.toString()); // Object Long is returned, cast to string
              }
              removedchannels = diff(removedchannelarr, client_channels.keyArray());
              for (let i = 0; i < removedchannels.length; i++) {
                queries_removedchans.push(parallelqry("UPDATE channels SET deleted = true WHERE channelid = ?", [removedchannels[i]]));
              }
              return removedchannels;
            })
            .then(() => {
              return parallelqry("SELECT categoryid FROM categories WHERE deleted = false AND guildid = ? ALLOW FILTERING", [channels[0].id]) //ALLOW FILTERING BECAUSE NO PRIMARY KEY https://docs.datastax.com/en/cql/3.3/cql/cql_using/useMultIndexes.html
                .then(results => {
                  let removedcategoriesarr = [];
                  let removedcategories = [];
                  for (let i = 0; i < results.rows.length; i++) {
                    removedcategoriesarr.push(results.rows[i].categoryid.toString());
                  }
                  removedcategories = diff(removedcategoriesarr, client_channels.keyArray());
                  for (let i = 0; i < removedcategories.length; i++) {
                    queries_removedchans.push(parallelqry("UPDATE categories SET deleted = false WHERE categoryid = ? ALLOW FILTERING",[removedcategories[i]]));
                  }
                  return removedcategories;
                })
            })
        } else if (action === 'delete' || action === 'guild_delete') {
          for(let i=0; i < channels.length; i++){
            queries_removedchans.push(parallelqry("UPDATE categories SET deleted = true WHERE categoryid = ?", [channels[i].id]))
            queries_removedchans.push(parallelqry("UPDATE channels SET deleted = true WHERE channelid = ?", [channels[i].id]))
          }
        }
      })
      .then(() => {
        return Promise.all(queries_removedchans);
      })
      .then(async function updateChannels() {
        let queries2 = [];
        for (let i = 0; i < channels.length; i++) {
          if (channels[i].type === 'category') {
            await parallelqry("SELECT name FROM categories WHERE categoryid = ?", [channels[i].id])
              .then(results => {
                if (results.rows[0].name !== channels[i].name) {
                  queries2.push(parallelqry("INSERT INTO categories_edits(categoryeditid, oldname, newname, categoryid) VALUES (?, ?, ?, ?)", [TimeUuid.now(), results.rows[0].name, channels[i].name, channels[i].id])
                  .then(() => {
                    return parallelqry("UPDATE categories SET Name = ? WHERE categoryid = ?", [channels[i].name, channels[i].id])
                  }));
                }
              });
          } else if (channels[i].type !== 'dm') {
            await parallelqry("SELECT name,categoryid FROM channels WHERE channelid = ?", [channels[i].id]) //CategoryId is too big for node ints, needs to be retrieved as a string
              .then(results => {
                let temp_categoryid = null;
                if (results.rows[0].categoryid !== null && results.rows[0].categoryid !== undefined)
                  temp_categoryid = results.rows[0].categoryid.toString()
                if ((results.rows[0].name != channels[i].name) || (temp_categoryid != channels[i].parentID)) {
                  queries2.push(parallelqry("INSERT INTO channels_edits(channeleditid, oldname, newname, oldcategoryid, newcategoryid, channelid) VALUES (?, ?, ?, ?, ?, ?);", [TimeUuid.now(), results.rows[0].name, channels[i].name, temp_categoryid, channels[i].parentID, channels[i].id])
                  .then(() => {
                    return parallelqry("UPDATE channels SET name = ?, categoryid = ? WHERE channelid = ?", [channels[i].name, channels[i].parentID, channels[i].id])
                  }));
                }
              });
          }
        }
        return Promise.all(queries2)
          .then(() => {
            resolve('doneHandleChannel');
          })
      })
      .catch(err => {
        reject(err)
      })
  });
}

function populatedb() {
  return new Promise(function(resolve, reject) {
    //var client_users = client.users.array();
    //var client_guilds = client.guilds.array();
    //var client_channels = client.channels.array();
    Promise.resolve()
      .then(function users() {
        return handleUsers(client.users, 'initialize')
      })
      .then(function guilds() {
        return handleGuilds(client.guilds, 'initialize');
      })
            .then(function channels() {
              return handleChannels(client.channels, 'initialize');
            })
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
  guildCreate !!!
  guildDelete !!!
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

client.on('channelCreate', channel => {
  if (dbdone) {
    handleChannels([channel], 'create')
      .then(statusmsg => console.log('channelCreate', statusmsg))
      .catch(err => console.log("Error in 'channelCreate' function_1\n", err))
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

*/

client.on('guildMemberAdd', function(member) {
  handleUsers(member.user, function(err, result) {
    console.log(result);
  });
  console.log("fired guildMemberAdd", member)
});

client.on('guildCreate', guild => {
  if (dbdone) {
    guild_lock = true;
    handleGuilds([guild], 'add')
    .then(() => {
      console.log('entrai channelllls')
      return handleChannels(guild.channels, 'guild')
    })
      .then(statusmsg => {
        if (statusmsg !== 'Qempty')
          console.log('guildCreate', statusmsg)
      })
      .catch(err => console.log("Error in 'guildCreate' function\n", err));
  }
})

client.on('guildDelete', guild => {
  if (dbdone) {
    handleGuilds([guild], 'remove')
    .then( () => {
      return handleChannels(guild.channels, 'guild_delete')
    })
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

client.login(token);
