// index.js
// Auto vouch bot – every 15 minutes sends TWO vouches:
// - 2 different random server members as voucher (if possible)
// - same random middleman for both
// - second vouch has "Proof of trade" button
// - button shows a random video link
// - voucher's PFP is used as embed thumbnail
// - includes a small web server (keep-alive port)

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  ActivityType // Added for status
} = require("discord.js");
const express = require("express"); // for keep-alive server

const config = require("./config.json");

// TOKEN **only** from environment (safe for GitHub)
const TOKEN = process.env.TOKEN;
const VOUCH_CHANNEL_ID = config.vouchChannelId;
const MIDDLEMEN = config.middlemen || [];
const VIDEOS = config.videos || [];

// 15 minutes in ms
const VOUCH_INTERVAL = 15 * 60 * 1000;

if (!TOKEN) {
  console.error("❌ No bot token found. Set TOKEN environment variable.");
  process.exit(1);
}

if (!VOUCH_CHANNEL_ID) {
  console.error("❌ No vouchChannelId set in config.json");
  process.exit(1);
}

if (!MIDDLEMEN.length) {
  console.warn("⚠️ No middlemen IDs configured. Middleman will show as 'Unknown'.");
}

if (!VIDEOS.length) {
  console.warn("⚠️ No video links configured. Proof button will send a placeholder message.");
}

// Small web server so host thinks app is alive
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Vouch bot is running ✅");
});

app.listen(PORT, () => {
  console.log(`🌐 Keep-alive server listening on port ${PORT}`);
});

// Create client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, // Added for message sending
    GatewayIntentBits.MessageContent // Added for message content access
  ],
  partials: [Partials.GuildMember]
});

// Helper – random element from array
function randomFromArray(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Build a single vouch embed
function buildVouchEmbed(member, middlemanId) {
  const voucherMention = member ? `<@${member.id}>` : "Someone";
  const middlemanMention = middlemanId ? `<@${middlemanId}>` : "Unknown";

  const embed = new EmbedBuilder()
    .setTitle("📎・ New Vouch !")
    .setDescription(
      `**⤷ ${voucherMention} has successfully provided a vouch for our service.**\n\n` +
      `👥 **Middleman:** ${middlemanMention}`
    )
    .setColor(0x9b5cff) // Purple color (0x9b5cff is purple, not orange)
    .setFooter({ text: "Trusted Vouch System" })
    .setTimestamp();

  if (member) {
    embed.setThumbnail(
      member.user.displayAvatarURL({
        extension: "png",
        size: 512,
        dynamic: true // Added dynamic for better compatibility
      })
    );
  }

  return embed;
}

// Send two vouches to the configured channel
async function sendAutoVouchPair() {
  try {
    const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      console.error("❌ Vouch channel is invalid or not text-based.");
      return;
    }

    const guild = channel.guild;

    // Fetch members once
    const members = await guild.members.fetch();
    const humans = members.filter(m => !m.user.bot);
    const humansArray = Array.from(humans.values());

    let member1 = null;
    let member2 = null;

    if (humansArray.length === 0) {
      console.warn("⚠️ No human members found, using 'Someone' as voucher.");
    } else if (humansArray.length === 1) {
      member1 = humansArray[0];
      member2 = humansArray[0];
    } else {
      const index1 = Math.floor(Math.random() * humansArray.length);
      let index2 = Math.floor(Math.random() * humansArray.length);

      // ensure different index
      while (index2 === index1) {
        index2 = Math.floor(Math.random() * humansArray.length);
      }

      member1 = humansArray[index1];
      member2 = humansArray[index2];
    }

    const middlemanId = MIDDLEMEN.length ? randomFromArray(MIDDLEMEN) : null;

    const embed1 = buildVouchEmbed(member1, middlemanId);
    const embed2 = buildVouchEmbed(member2, middlemanId);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("proof_of_trade")
        .setLabel("Proof of trade")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📹") // Added emoji for better visual
    );

    await channel.send({ embeds: [embed1] });
    await channel.send({ embeds: [embed2], components: [row] });

    console.log(`✅ Sent vouch pair in #${channel.name} (${channel.id}) at ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error("❌ Error while sending auto vouch pair:", err);
  }
}

// Ready event
client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 Logged in as ${c.user.tag}`);
  console.log(`📊 Bot Name: ${c.user.username}`);
  console.log(`🆔 Bot ID: ${c.user.id}`);
  console.log(`🏠 Serving ${c.guilds.cache.size} server(s)`);

  // Set bot status to show which bot is online
  client.user.setPresence({
    activities: [{
      name: `Auto Vouch Bot | ${c.user.username}`,
      type: ActivityType.Custom // or ActivityType.Watching
    }],
    status: 'online'
  });

  // First pair immediately
  await sendAutoVouchPair();
  
  // Then forever every 15 minutes
  setInterval(sendAutoVouchPair, VOUCH_INTERVAL);
  console.log(`⏰ Auto-vouch interval set to 15 minutes (${VOUCH_INTERVAL}ms)`);
});

// Handle button click for "Proof of trade"
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "proof_of_trade") return;

  try {
    await interaction.deferReply({ ephemeral: true }); // Defer reply to handle async operations

    if (!VIDEOS.length) {
      await interaction.editReply({
        content: "No proof videos are configured yet."
      });
      return;
    }

    const video = randomFromArray(VIDEOS);

    await interaction.editReply({
      content: `📹 **Proof of trade:**\n${video}\n\n*This is an automated vouch system.*`
    });
  } catch (err) {
    console.error("❌ Error handling proof button:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Something went wrong while fetching proof of trade.",
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: "❌ Failed to fetch proof video. Please try again later."
      });
    }
  }
});

// Error handling for the client
client.on('error', console.error);
client.on('warn', console.warn);

// Start the bot
client.login(TOKEN).catch(err => {
  console.error("❌ Failed to log in:", err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down vouch bot gracefully...');
  client.destroy();
  process.exit(0);
});
