const Discord = require('discord.js');
const client = new Discord.Client();
const token = process.argv.length == 2 ? process.env.token : "";
const welcomeChannelName = "안녕하세요";
const byeChannelName = "안녕히가세요";
const welcomeChannelComment = "어서오세요.";
const byeChannelComment = "안녕히가세요.";


client.on('ready', () => {
  console.log('켰다.');
  client.user.setPresence({ game: { name: '오늘도 일' }, status: 'online' })
});

const {Manager} = require('@lavacord/discord.js');
const nodes = [{
    id: '1',
    host: 'localhost',
    port: 2333,
    password: "alslwnsl1082"
}];
const mainPlayer = new Manager(bot, nodes);

// Load search packages
const Youtube = require('simple-youtube-api');
const youtube = new Youtube(config.yt);

// Handle Error on Player
mainPlayer.on('error', err => {
    console.error(err);
});

// Connect when ready
bot.on('ready', async () => {
    await mainPlayer.connect();
    console.log("Ready!");
});

//-------------------------------------------------------------------------
// Variables for music playing
//-------------------------------------------------------------------------

const queue = new Map();

//-------------------------------------------------------------------------
// Functions for lavalink
//-------------------------------------------------------------------------

// Get songs
const fetch = require('node-fetch');
const {URLSearchParams} = require('url');

const getSongs = async (search) => {
    const node = mainPlayer.idealNodes[0];

    const params = new URLSearchParams();
    params.append("identifier", search);

    return fetch(`http://${node.host}:${node.port}/loadtracks?${params}`, {headers: {Authorization: node.password}})
        .then(res => res.json())
        .then(data => data.tracks)
        .catch(err => {
            console.error(err);
            return null;
        });
};

const play = async (guildID, song) => {
    if(!song){
        await mainPlayer.leave(guildID);
        queue.delete(guildID);
        return;
    }

    const player = await mainPlayer.join(
        {
            guild: guildID,
            channel: queue.get(guildID).voiceChannel.id,
            node: "1"
        }
    );

    await player.play(song.track);
    player.on('end', data => {
        if(data.reason != "REPLACED"){
            if(!queue.get(guildID).loop) queue.get(guildID).songs.shift();
            play(guildID, queue.get(guildID).songs[0]);
        }
    });
};

//-------------------------------------------------------------------------
// Functions for discord.js
//-------------------------------------------------------------------------

// Formatting text
const fmt = (str) => {
    return `**:books:  ${str}**`;
}

// Command list
const command = {
    help: async (msg, args) => {
        msg.channel.send(fmt("This bot has been developed by G2G3. Click this link to visit his youtube channel.") + "\n\nhttps://www.youtube.com/channel/UCENpy2LO3tyF32WMbQK0xog");
    },
    play: async (msg, args) => {
        const voiceChannel = msg.member.voice.channel;
        if(!voiceChannel) return msg.channel.send(fmt("Connect to a voice channel first!"));
        if(args.length == 0) return command.resume(msg, args);

        const serverQueue = queue.get(msg.guild.id);
        let str = args.join(' ');

        let result = null;
        if(str.startsWith("https://")){
            let find = await youtube.getVideo(str);
            if(!find) return msg.channel.send(fmt("No video found by that link."));

            result = await getSongs(find.url);
            result = result[0];
            
            if(!result) return msg.channel.send(fmt("Unexpected error occured. (Usually because the video is invalid)"));
        }
        else{
            // Searching
            let search = await youtube.searchVideos(str, 5);
            if(!search || search.length == 0) return msg.channel.send(fmt("No videos found by that name."));

            let embed = new Discord.MessageEmbed()
                .setTitle("Search results")
                .setDescription(`for ${str}`)
                .setColor('BLUE');

            search.forEach((v,i) => embed.addField(i + 1, `${v.channel.title} : ${v.title}`, false));
            
            const ask = await msg.channel.send(embed);

            const filter = (response) => {
                return (response.author.id === msg.author.id && !isNaN(response.content) && 0 < response.content && response.content <= 5);
            }

            let resp = await msg.channel.awaitMessages(filter, {max: 1, time: 60000});
            resp = resp.last().content;

            result = await getSongs(search[resp - 1].url);
            result = result[0];

            if(!result) return msg.channel.send(fmt("Unexpected error occured. (Usually because the video is invalid)"));

            ask.delete();
        }

        // Playing
        if(serverQueue){
            serverQueue.songs.push(result);
        }
        else{
            let queueConstruct = {
                textChannel: msg.channel,
                voiceChannel: voiceChannel,
                songs: [],
                loop: false
            };

            queue.set(msg.guild.id, queueConstruct);

            queueConstruct.songs.push(result);

            play(msg.guild.id, result);
        }
        
        msg.channel.send(fmt("Succesfully added to queue."));
    },
    stop: async (msg, args) => {
        const voiceChannel = msg.member.voice.channel;
        if(!voiceChannel) return msg.channel.send(fmt("Connect to a voice channel first!"));

        if(!queue.has(msg.guild.id)) return msg.channel.send(fmt("There is no queue playing!"));

        if(!voiceChannel.members.has(bot.user.id)) return msg.channel.send(fmt("You must be in the same channel as the bot!"));

        queue.delete(msg.guild.id);
        await mainPlayer.leave(msg.guild.id);

        msg.channel.send(fmt("Stopped playing music."));
    },
    skip: async (msg, args) => {
        const voiceChannel = msg.member.voice.channel;
        if(!voiceChannel) return msg.channel.send(fmt("Connect to a voice channel first!"));

        if(!queue.has(msg.guild.id)) return msg.channel.send(fmt("There is no queue playing!"));

        if(!voiceChannel.members.has(bot.user.id)) return msg.channel.send(fmt("You must be in the same channel as the bot!"));

        if(queue.get(msg.guild.id).loop) queue.get(msg.guild.id).songs.shift();
        await mainPlayer.players.get(msg.guild.id).stop();

        msg.channel.send(fmt("Skipped one song!"));
    },
    pause: async (msg, args) => {
        const voiceChannel = msg.member.voice.channel;
        if(!voiceChannel) return msg.channel.send(fmt("Connect to a voice channel first!"));

        if(!queue.has(msg.guild.id)) return msg.channel.send(fmt("There is no queue playing!"));

        if(!voiceChannel.members.has(bot.user.id)) return msg.channel.send(fmt("You must be in the same channel as the bot!"));

        if(mainPlayer.players.get(msg.guild.id).paused) return msg.channel.send(fmt("Already paused music! Use command 'resume' to unpause this."));

        await mainPlayer.players.get(msg.guild.id).pause();

        msg.channel.send(fmt("Paused the music!"));
    },
    resume: async (msg, args) => {
        const voiceChannel = msg.member.voice.channel;
        if(!voiceChannel) return msg.channel.send(fmt("Connect to a voice channel first!"));

        if(!queue.has(msg.guild.id)) return msg.channel.send(fmt("There is no queue playing!"));

        if(!voiceChannel.members.has(bot.user.id)) return msg.channel.send(fmt("You must be in the same channel as the bot!"));

        if(!mainPlayer.players.get(msg.guild.id).paused) return msg.channel.send(fmt("The player is not paused!"));

        await mainPlayer.players.get(msg.guild.id).resume();

        msg.channel.send(fmt("Unpaused the music!"));
    },
    queue: async (msg, args) => {
        if(!queue.has(msg.guild.id)) return msg.channel.send(fmt("There is no queue playing!"));

        let embed = new Discord.MessageEmbed()
            .setTitle("Queue list for songs")
            .setDescription(`Guild ID : ${msg.guild.id}`)
            .setColor('GREEN');

        queue.get(msg.guild.id).songs.forEach((v,i) => embed.addField(i + 1, `${v.info.author} : ${v.info.title}`, false));

        msg.channel.send(embed);
    },
    remove: async (msg, args) => {
        const voiceChannel = msg.member.voice.channel;
        if(!voiceChannel) return msg.channel.send(fmt("Connect to a voice channel first!"));

        if(!queue.has(msg.guild.id)) return msg.channel.send(fmt("There is no queue playing!"));

        if(!voiceChannel.members.has(bot.user.id)) return msg.channel.send(fmt("You must be in the same channel as the bot!"));

        if(!(0 < args[0] && args[0] <= queue.get(msg.guild.id).songs.length)) return msg.channel.send(fmt("Wrong range of removal."));

        queue.get(msg.guild.id).songs.splice(args[0] - 1, 1);

        msg.channel.send(fmt("Removed from queue."));
    },
    loop: async (msg, args) => {
        const voiceChannel = msg.member.voice.channel;
        if(!voiceChannel) return msg.channel.send(fmt("Connect to a voice channel first!"));

        if(!queue.has(msg.guild.id)) return msg.channel.send(fmt("There is no queue playing!"));

        if(!voiceChannel.members.has(bot.user.id)) return msg.channel.send(fmt("You must be in the same channel as the bot!"));

        queue.get(msg.guild.id).loop = !queue.get(msg.guild.id).loop;

        msg.channel.send(fmt(`Toggled loop. (Now ${queue.get(msg.guild.id).loop})`));
    }
}

// Bot receive message
bot.on('message', async msg => {
    // If bot
    if(msg.author.bot) return;

    // If no guild
    if(!msg.guild) return;

    // Check beginning prefix
    const msgArray = msg.content.split(" ");
    const prefix = ">";
    
    if(!msgArray[0].startsWith(prefix)) return;

    // Divide into cmd / args
    const cmd = msgArray[0].substring(prefix.length);
    msgArray.shift();
    const args = [...msgArray];

    if(!command.hasOwnProperty(cmd)) return msg.channel.send(fmt("No command associated with input."));

    command[cmd](msg, args);
});

client.on("guildMemberAdd", (member) => {
  const guild = member.guild;
  const newUser = member.user;
  const welcomeChannel = guild.channels.find(channel => channel.name == welcomeChannelName);

  welcomeChannel.send(`<@${newUser.id}> ${welcomeChannelComment}\n`);

  member.addRole(guild.roles.find(role => role.name == "GUEST"));
});

client.on("guildMemberRemove", (member) => {
  const guild = member.guild;
  const deleteUser = member.user;
  const byeChannel = guild.channels.find(channel => channel.name == byeChannelName);

  byeChannel.send(`<@${deleteUser.id}> ${byeChannelComment}\n`);
});

client.on('message', (message) => {
  if(message.author.bot) return;

  if(message.content == 'ping') {
    return message.reply('pong');
  }
  if(message.content == 'MINE준') {
    return message.reply('MINE준 바보 입니다');
  }
  const newLocal = '!전체공지';
  if(message.content == 'Ang') {
    return message.reply('앙');
  }

  else if(message.content == '!초대코드2') {
    client.guilds.array().forEach(x => {
      x.channels.find(x => x.type == 'text').createInvite({maxAge: 0}) // maxAge: 0은 무한이라는 의미, maxAge부분을 지우면 24시간으로 설정됨
        .then(invite => {
          message.channel.send(invite.url)
        })
        .catch((err) => {
          if(err.code == 50013) {
            message.channel.send('**'+x.channels.find(x => x.type == 'text').guild.name+'** 채널 권한이 없어 초대코드 발행 실패')
          }
        })
    });
  } else if(message.content == '!초대코드') {
    if(message.channel.type == 'dm') {
      return message.reply('dm에서 사용할 수 없는 명령어 입니다.');
    }
    message.guild.channels.get(message.channel.id).createInvite({maxAge: 0}) // maxAge: 0은 무한이라는 의미, maxAge부분을 지우면 24시간으로 설정됨
      .then(invite => {
        message.channel.send(invite.url)
      })
      .catch((err) => {
        if(err.code == 50013) {
          message.channel.send('**'+message.guild.channels.get(message.channel.id).guild.name+'** 채널 권한이 없어 초대코드 발행 실패')
        }
      })
  } else if(message.content.startsWith('!전체공지2')) {
    if(checkPermission(message)) return
    if(message.member != null) { // 채널에서 공지 쓸 때
      let contents = message.content.slice('!전체공지2'.length);
      let embed = new Discord.RichEmbed()
        .setAuthor('공지 MINEMin05 BOT')
        .setColor('#186de6')
        .setFooter(`공지 입니다`)
        .setTimestamp()
  
      embed.addField('공지: ', contents);
  
      message.member.guild.members.array().forEach(x => {
        if(x.user.bot) return;
        x.user.send(embed)
      });
  
      return message.reply('공지를 전송했습니다.');
    } else {
      return message.reply('채널에서 실행해주세요.');
    }
  } else if(message.content.startsWith(newLocal)) {
    if(checkPermission(message)) return
    if(message.member != null) { // 채널에서 공지 쓸 때
      let contents = message.content.slice('!전체공지'.length);
      message.member.guild.members.array().forEach(x => {
        if(x.user.bot) return;
        x.user.send(`<@${message.author.id}> ${contents}`);
      });
  
      return message.reply('공지를 전송했습니다.');
    } else {
      return message.reply('채널에서 실행해주세요.');
    }
  } else if(message.content.startsWith('!청소')) {
    if(message.channel.type == 'dm') {
      return message.reply('dm에서 사용할 수 없는 명령어 입니다.');
    }
    
    if(message.channel.type != 'dm' && checkPermission(message)) return

    var clearLine = message.content.slice('!청소 '.length);
    var isNum = !isNaN(clearLine)

    if(isNum && (clearLine <= 0 || 100 < clearLine)) {
      message.channel.send("1부터 100까지의 숫자만 입력해주세요.")
      return;
    } else if(!isNum) {
      if(message.content.split('<@').length == 2) {
        if(isNaN(message.content.split(' ')[2])) return;

        var user = message.content.split(' ')[1].split('<@!')[1].split('>')[0];
        var count = parseInt(message.content.split(' ')[2])+1;
        let _cnt = 0;

        message.channel.fetchMessages().then(collected => {
          collected.every(msg => {
            if(msg.author.id == user) {
              msg.delete();
              ++_cnt;
            }
            return !(_cnt == count);
          });
        });
      }
    } else {
      message.channel.bulkDelete(parseInt(clearLine)+1)
        .then(() => {
          AutoMsgDelete(message, `<@${message.author.id}> ` + parseInt(clearLine) + "개의 메시지를 삭제했습니다. (이 메세지는 잠시 후에 사라집니다.)");
        })
        .catch(console.error)
    }
  }
});

function checkPermission(message) {
  if(!message.member.hasPermission("MANAGE_MESSAGES")) {
    message.channel.send(`<@${message.author.id}> ` + "명령어를 수행할 관리자 권한을 소지하고 있지않습니다.")
    return true;
  } else {
    return false;
  }
}

function changeCommandStringLength(str, limitLen = 8) {
  let tmp = str;
  limitLen -= tmp.length;

  for(let i=0;i<limitLen;i++) {
      tmp += ' ';
  }

  return tmp;
}

async function AutoMsgDelete(message, str, delay = 3000) {
  let msg = await message.channel.send(str);

  setTimeout(() => {
    msg.delete();
  }, delay);
}


client.login(token);