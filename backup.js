//backup

//console.log("banana " + users);
for (var i = 0, userlen = users.length; i < userlen; i++) {
  var userId = users[i].id;
  var avatarPath = path.resolve(__dirname, './avatars', userId);
  var avatarUrl = users[i].displayAvatarURL;


//escapeqry("INSERT INTO users (UserId , Tag, Bot, AvatarUrl, AvatarPath, Edited) SELECT * FROM (SELECT ?, ?, ?, ?, ?, 0 ) AS tmp WHERE NOT EXISTS (SELECT UserId FROM users WHERE UserId = ? ) LIMIT 1;", [userId, users[i].tag, users[i].bot, avatarUrl, avatarPath + "-0000.png", userId]);
con.query("INSERT INTO users (UserId , Tag, Bot, AvatarUrl, Edited) SELECT * FROM (SELECT ?, ?, ?, ?, 0 ) AS tmp WHERE NOT EXISTS (SELECT UserId FROM users WHERE UserId = ? ) LIMIT 1;", [userId, users[i].tag, users[i].bot, avatarUrl, userId], function(err, result, fields) {
  if (err) throw err;
  con.query("SELECT AvatarUrl, AvatarPath FROM users WHERE UserId = ?", userId, function(err, result, fields) {
    if (err) throw err;
    console.log(result);
    var currentPath = result[0].AvatarPath;
    var newPath;
    if (currentPath === null) {
      console.log("sono entrato perchè server = " + result[0].AvatarUrl + " e db = " + avatarUrl + "e userid" + userId);
      newPath = path.resolve(avatarPath + "-0000" + ".png");
    } else if (result[0].AvatarUrl !== avatarUrl) {
      console.log("sono entrato perchè server = " + result[0].AvatarUrl + " e db = " + avatarUrl + "e userid" + userId);
      //escapeqry("UPDATE users SET AvatarUrl = ?, AvatarPath = ? WHERE UserId = ?", [avatarUrl, ] )
      newPath = path.resolve(avatarPath + (((currentPath.substr(currentPath.length - 8, currentPath.length - 4)) + 1)).toString().padStart(4, "0") + ".png");
      console.log(avatarUrl + newPath + userId);
      //download(path.resolve(avatarPath + "-0.png"), avatarUrl);
    }
    con.query("UPDATE users SET AvatarUrl = ?, AvatarPath = ? WHERE UserId = ?", [avatarUrl, newPath, userId], function(err, result, fields) {
      if (err) throw err;
    });
  });
});

/*var guilds = client.guilds.array();
for (var i = 0, len = guilds.length; i < len; i++) {
  if (guilds[i].available) {
    var tempid = guilds[i].id;
    escapeqry("INSERT INTO guilds (GuildId, Name, Available) SELECT * FROM (SELECT ?, ?, 1 ) AS tmp WHERE NOT EXISTS (SELECT GuildId FROM guilds WHERE GuildId = ? ) LIMIT 1;", [tempid, guilds[i].name, tempid]);
    var tempmembers = guilds[i].members.array();
    for (var k = 0, memblen = tempmembers.length; k < memblen; k++) {
      var userId = tempmembers[k].id;
      var avatarPath = path.resolve(__dirname, './avatars',  userId);
      var avatarUrl = tempmembers[k].user.displayAvatarURL;
      escapeqry("INSERT INTO users (UserId , Tag, Bot, AvatarUrl, AvatarPath, Edited) SELECT * FROM (SELECT ?, ?, ?, ?, ?, 0 ) AS tmp WHERE NOT EXISTS (SELECT UserId FROM users WHERE UserId = ? ) LIMIT 1;", [userId, tempmembers[k].user.tag, tempmembers[k].user.bot, avatarUrl, avatarPath + "-0000.png", tempmembers[k].id]);
      con.query("SELECT AvatarUrl, AvatarPath FROM users WHERE UserId = ?", [userId], function(err, result, fields) {
        if (err) throw err;
        if(result[0].AvatarUrl !== avatarUrl){
          console.log(avatarUrl);
          download(path.resolve(avatarPath + "-0.png"), avatarUrl);
        }
      });
    }
  }
}
var tempchannels = client.channels.array();
for (var j = 0, chlen = tempchannels.length; j < chlen; j++) {
  if (tempchannels[j].type === 'category') {
    escapeqry("INSERT INTO categories (CategoryId, Name, GuildId) SELECT * FROM (SELECT ?, ?, ? ) AS tmp WHERE NOT EXISTS (SELECT CategoryId FROM categories WHERE CategoryId = ? ) LIMIT 1;", [tempchannels[j].id, tempchannels[j].name, tempid, tempchannels[j].id]);
  } else if (tempchannels[j].type === 'voice' || tempchannels[j].type === 'text') {
    escapeqry("INSERT INTO channels (ChannelId, Name, Type, CategoryId) SELECT * FROM (SELECT ?, ?, ?, ? ) AS tmp WHERE NOT EXISTS (SELECT ChannelId FROM channels WHERE ChannelId = ? ) LIMIT 1;", [tempchannels[j].id, tempchannels[j].name, tempchannels[j].type, tempchannels[j].parentID, tempchannels[j].id]);
  } else if (tempchannels[j].type === 'dm') {
    escapeqry("INSERT INTO dmchannels (DmId, UserId) SELECT * FROM (SELECT ?, ? ) AS tmp WHERE NOT EXISTS (SELECT DmId FROM dmchannels WHERE DmId = ? ) LIMIT 1;", [tempchannels[j].id, tempchannels[j].recipient.id]);
  }
}*/
