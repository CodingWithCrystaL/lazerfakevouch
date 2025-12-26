// index.js
// Auto vouch bot – every 15 minutes sends TWO vouches

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  ActivityType
} = require("discord.js");
const express = require("express");

// ===== CONFIGURATION CHECK =====
console.log("🔧 Starting vouch bot...");

const config = require("./config.json");
const TOKEN = process.env.TOKEN;
const VOUCH_CHANNEL_ID = config.vouchChannelId;
const MIDDLEMEN = config.middlemen || [];
const VIDEOS = config.videos || [];
const VOUCH_INTERVAL = 15 * 60 * 1000; // 15 minutes

// Validate configuration
if (!TOKEN) {
  console.error("❌ FATAL: TOKEN environment variable is not set!");
  console.error("💡 On Render: Go to Environment → Add TOKEN=your_bot_token");
  process.exit(1);
}

if (!VOUCH_CHANNEL_ID) {
  console.error("❌ FATAL: vouchChannelId not set in config.json");
  process.exit(1);
}

console.log("✅ Configuration loaded successfully");

// ===== WEB SERVER FOR RENDER =====
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("✅ Vouch bot is online");
});

app.listen(PORT, () => {
  console.log(`🌐 Keep-alive server on port ${PORT}`);
});

// ===== DISCORD CLIENT SETUP =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.GuildMember]
});

// ===== HELPER FUNCTIONS =====
function randomFromArray(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildVouchEmbed(member, middlemanId) {
  const voucherMention = member ? `<@${member.id}>` : "Someone";
  const middlemanMention = middlemanId ? `<@${middlemanId}>` : "Unknown";

  const embed = new EmbedBuilder()
    .setTitle("📎・ New Vouch !")
    .setDescription(
      `**⤷ ${voucherMention} has successfully provided a vouch for our service.**\n\n` +
      `👥 **Middleman:** ${middlemanMention}`
    )
    .setColor(0x9b5cff)
    .setFooter({ text: "Trusted Vouch System" })
    .setTimestamp();

  if (member) {
    embed.setThumbnail(
      member.user.displayAvatarURL({
        extension: "png",
        size: 512,
        dynamic: true
      })
    );
  }

  return embed;
}

// ===== MAIN VOUCH FUNCTION =====
async function sendAutoVouchPair() {
  try {
    console.log(`🔄 Attempting to send vouch pair at ${new Date().toLocaleTimeString()}`);
    
    const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      console.error("❌ Vouch channel not found or invalid");
      return;
    }

    const guild = channel.guild;
    
    // Fetch members
    const members = await guild.members.fetch();
    const humans = members.filter(m => !m.user.bot);
    const humansArray = Array.from(humans.values());

    let member1 = null;
    let member2 = null;

    if (humansArray.length === 0) {
      console.warn("⚠️ No human members found, using 'Someone' as voucher");
    } else if (humansArray.length === 1) {
      member1 = humansArray[0];
      member2 = humansArray[0];
      console.log(`👤 Using same member (${member1.user.tag}) for both vouches`);
    } else {
      const index1 = Math.floor(Math.random() * humansArray.length);
      let index2 = Math.floor(Math.random() * humansArray.length);
      while (index2 === index1) {
        index2 = Math.floor(Math.random() * humansArray.length);
      }
      member1 = humansArray[index1];
      member2 = humansArray[index2];
      console.log(`👥 Selected members: ${member1.user.tag} & ${member2.user.tag}`);
    }

    const middlemanId = MIDDLEMEN.length ? randomFromArray(MIDDLEMEN) : null;
    const middlemanName = middlemanId ? `<@${middlemanId}>` : "Unknown";
    
    console.log(`🤝 Middleman: ${middlemanName}`);

    const embed1 = buildVouchEmbed(member1, middlemanId);
    const embed2 = buildVouchEmbed(member2, middlemanId);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("proof_of_trade")
        .setLabel("Proof of trade")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📹")
    );

    // Send vouches
    await channel.send({ embeds: [embed1] });
    await channel.send({ embeds: [embed2], components: [row] });

    console.log(`✅ Vouch pair sent successfully in #${channel.name}`);
    console.log(`⏰ Next vouch in 15 minutes`);
    
  } catch (err) {
    console.error("❌ Error sending vouch pair:", err.message);
  }
}

// ===== DISCORD EVENT HANDLERS =====

// Ready event
client.once(Events.ClientReady, async (c) => {
  console.log("\n" + "=".repeat(50));
  console.log(`🤖 BOT IS ONLINE!`);
  console.log(`📛 Name: ${c.user.tag}`);
  console.log(`🆔 ID: ${c.user.id}`);
  console.log(`🏠 Servers: ${c.guilds.cache.size}`);
  console.log(`⏰ Started: ${new Date().toLocaleString()}`);
  console.log("=".repeat(50) + "\n");

  // Set bot status
  client.user.setPresence({
    activities: [{
      name: `Auto Vouch | ${c.user.username}`,
      type: ActivityType.Watching
    }],
    status: 'online'
  });

  // Send first vouch immediately
  console.log("🚀 Sending initial vouch pair...");
  await sendAutoVouchPair();
  
  // Set interval for subsequent vouches
  setInterval(sendAutoVouchPair, VOUCH_INTERVAL);
  console.log(`⏰ Auto-vouch interval set to 15 minutes\n`);
});

// Button interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton() || interaction.customId !== "proof_of_trade") return;

  try {
    await interaction.deferReply({ ephemeral: true });

    if (!VIDEOS.length) {
      await interaction.editReply({
        content: "📭 No proof videos configured yet."
      });
      return;
    }

    const video = randomFromArray(VIDEOS);
    await interaction.editReply({
      content: `📹 **Proof of trade:**\n${video}\n\n*Automated vouch system*`
    });
    
    console.log(`📹 Proof button clicked by ${interaction.user.tag}`);
    
  } catch (err) {
    console.error("❌ Button error:", err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Error fetching proof",
        ephemeral: true
      });
    }
  }
});

// Error handlers
client.on('error', (error) => {
  console.error("🔴 Discord Client Error:", error.message);
});

client.on('warn', (warning) => {
  console.warn("🟡 Discord Warning:", warning);
});

client.on('debug', (debug) => {
  if (debug.includes("Heartbeat") || debug.includes("VOICE")) return;
  console.log("🔧 Discord Debug:", debug);
});

// ===== START THE BOT =====
console.log("🔑 Attempting Discord login...");

client.login(TOKEN).then(() => {
  console.log("✅ Login successful, waiting for ready event...");
}).catch(error => {
  console.error("❌ LOGIN FAILED!");
  console.error("Error:", error.message);
  console.error("\n🔧 Troubleshooting:");
  console.error("1. Check TOKEN is correct");
  console.error("2. Enable these intents in Discord Dev Portal:");
  console.error("   • PRESENCE INTENT");
  console.error("   • SERVER MEMBERS INTENT");
  console.error("   • MESSAGE CONTENT INTENT");
  console.error("3. Re-invite bot with proper permissions");
  process.exit(1);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', () => {
  console.log('\n👋 SIGTERM received, shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 SIGINT received, shutting down...');
  client.destroy();
  process.exit(0);
});
