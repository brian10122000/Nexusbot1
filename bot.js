// ═══════════════════════════════════════════════════════════════
//  NexusBot — Bot Discord Complet
//  ✅ Slash Commands (/shop, /ticket, /regles, /ping, /produit)
//  ✅ Système de Tickets avec bouton
//  ✅ Webhook Sellhub (notifications de vente)
//  ✅ Auto-rôles (arrivée, vérification)
//  ✅ Messages de bienvenue / au revoir
//
//  INSTALLATION :
//  1. npm install discord.js express
//  2. Remplissez la config ci-dessous
//  3. node bot.js
// ═══════════════════════════════════════════════════════════════

const { Client, GatewayIntentBits, Partials, EmbedBuilder,
        ActionRowBuilder, ButtonBuilder, ButtonStyle,
        ModalBuilder, TextInputBuilder, TextInputStyle,
        PermissionFlagsBits, ChannelType, REST, Routes,
        SlashCommandBuilder, Events } = require('discord.js');
const express = require('express');

// ─── CONFIGURATION ───────────────────────────────────────────
const CONFIG = {
  token:       'VOTRE_TOKEN_BOT',          // Token du bot
  clientId:    'VOTRE_APPLICATION_ID',      // ID de l'application (pas le bot)
  guildId:     'VOTRE_GUILD_ID',            // ID de votre serveur
  sellhubKey:  'VOTRE_CLE_API_SELLHUB',    // Clé API Sellhub (optionnel)
  webhookPort: 3001,                        // Port pour recevoir les webhooks Sellhub

  // Channels (IDs)
  channels: {
    welcome:   '',   // #bienvenue
    bye:       '',   // #au-revoir
    sales:     '',   // #ventes (notifications Sellhub)
    rules:     '',   // #règles
    shop:      '',   // #boutique
    tickets:   '',   // Catégorie Discord pour les tickets
    logs:      '',   // #logs
    general:   '',   // #général
  },

  // Rôles (IDs)
  roles: {
    member:    '',   // Rôle membre (donné à l'arrivée)
    vip:       '',   // Rôle VIP / Acheteur
    support:   '',   // Rôle support (accès tickets)
  },

  // Messages personnalisables
  messages: {
    welcome: '👋 Bienvenue **{user}** sur **{server}** !\n\n🛒 Découvrez notre boutique dans <#{shop}>\n🎫 Besoin d\'aide ? Ouvrez un ticket !',
    bye:     '😢 **{user}** a quitté le serveur.',
  },

  // Sellhub
  sellhub: {
    storeUrl: 'https://votre-store.sellhub.cx', // URL de votre boutique
  }
};

// ─── SLASH COMMANDS DEFINITIONS ──────────────────────────────
const COMMANDS = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Vérifie si le bot est en ligne'),

  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('🛒 Affiche la boutique complète'),

  new SlashCommandBuilder()
    .setName('produit')
    .setDescription('🛒 Affiche un produit spécifique')
    .addStringOption(o => o.setName('nom').setDescription('Nom du produit').setRequired(true)),

  new SlashCommandBuilder()
    .setName('regles')
    .setDescription('📜 Affiche les règles du serveur'),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('🎫 Ouvre un ticket de support'),

  new SlashCommandBuilder()
    .setName('fermer')
    .setDescription('🔒 Ferme le ticket actuel'),

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('ℹ️ Informations sur le serveur'),

  new SlashCommandBuilder()
    .setName('donner-role')
    .setDescription('🎭 Donne un rôle à un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true)),

  new SlashCommandBuilder()
    .setName('retirer-role')
    .setDescription('🎭 Retire un rôle à un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('🗑️ Supprime des messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('nombre').setDescription('Nombre de messages à supprimer (max 100)').setRequired(true).setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName('annonce')
    .setDescription('📢 Envoie une annonce dans un channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('message').setDescription('Contenu de l\'annonce').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel cible').setRequired(false)),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('✨ Envoie un embed personnalisé')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('titre').setDescription('Titre de l\'embed').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Description').setRequired(false))
    .addStringOption(o => o.setName('couleur').setDescription('Couleur hex (ex: #5865F2)').setRequired(false))
    .addChannelOption(o => o.setName('channel').setDescription('Channel cible').setRequired(false)),

  new SlashCommandBuilder()
    .setName('commande')
    .setDescription('📦 Vérifier une commande Sellhub')
    .addStringOption(o => o.setName('email').setDescription('Email de la commande').setRequired(true)),
].map(cmd => cmd.toJSON());

// ─── CLIENT ──────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// ─── STATE ───────────────────────────────────────────────────
const ticketMap = new Map(); // userId → channelId
let shopProducts = []; // Cache produits Sellhub

// ─── REGISTER SLASH COMMANDS ─────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(CONFIG.token);
  try {
    console.log('📋 Enregistrement des slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(CONFIG.clientId, CONFIG.guildId),
      { body: COMMANDS }
    );
    console.log(`✅ ${COMMANDS.length} slash commands enregistrées !`);
  } catch (err) {
    console.error('❌ Erreur enregistrement commands:', err.message);
  }
}

// ─── SELLHUB API ─────────────────────────────────────────────
async function fetchSellhubProducts() {
  if (!CONFIG.sellhubKey) return [];
  try {
    const res = await fetch('https://dash.sellhub.cx/api/sellhub/products', {
      headers: { Authorization: CONFIG.sellhubKey }
    });
    const data = await res.json();
    shopProducts = Array.isArray(data.data) ? data.data : (data.products || data || []);
    if (!Array.isArray(shopProducts)) shopProducts = [];
    console.log(`🛒 ${shopProducts.length} produits Sellhub chargés`);
    return shopProducts;
  } catch (e) {
    console.error('⚠️ Sellhub API:', e.message);
    return [];
  }
}

// ─── EMBEDS HELPERS ──────────────────────────────────────────
function colorToInt(hex) {
  return parseInt((hex || '#5865F2').replace('#', ''), 16);
}

function shopEmbed(products) {
  const embed = new EmbedBuilder()
    .setTitle('🛒 Notre Boutique')
    .setColor(colorToInt('#635BFF'))
    .setTimestamp()
    .setFooter({ text: 'Paiement sécurisé • Livraison instantanée' });

  if (!products.length) {
    embed.setDescription('Aucun produit disponible pour le moment.');
    return embed;
  }

  products.slice(0, 10).forEach(p => {
    const name = p.name || p.title || 'Produit';
    const price = p.price != null ? parseFloat(p.price).toFixed(2) + '€' : '—';
    const link = p.url || p.checkoutUrl || CONFIG.sellhub.storeUrl;
    const stock = p.stock != null ? (p.stock === 0 ? '❌ Rupture' : `✅ ${p.stock} dispo`) : '✅ Dispo';
    embed.addFields({ name: `${name} — ${price}`, value: `${stock}\n[**→ Acheter**](${link})`, inline: true });
  });

  if (CONFIG.sellhub.storeUrl) {
    embed.addFields({ name: '\u200b', value: `[🌐 **Voir toute la boutique**](${CONFIG.sellhub.storeUrl})`, inline: false });
  }
  return embed;
}

function productEmbed(product) {
  const name = product.name || product.title || 'Produit';
  const price = product.price != null ? parseFloat(product.price).toFixed(2) + '€' : '—';
  const desc = (product.description || '').replace(/<[^>]+>/g, '').substring(0, 400);
  const link = product.url || product.checkoutUrl || CONFIG.sellhub.storeUrl;
  const img = product.image || product.thumbnail || '';
  const stock = product.stock != null ? (product.stock === 0 ? '❌ En rupture de stock' : `✅ ${product.stock} disponible(s)`) : '✅ Disponible';

  const embed = new EmbedBuilder()
    .setTitle(`🛒 ${name}`)
    .setDescription(desc || 'Aucune description disponible.')
    .setColor(colorToInt('#635BFF'))
    .addFields(
      { name: '💰 Prix', value: `**${price}**`, inline: true },
      { name: '📦 Stock', value: stock, inline: true },
      { name: '🔗 Acheter', value: link ? `[**Payer maintenant**](${link})` : 'Non disponible', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Sellhub • Paiement sécurisé' });

  if (img) embed.setImage(img);
  return embed;
}

function saleEmbed(order) {
  const product = order.product?.name || order.productName || 'Produit inconnu';
  const amount = order.amount != null ? parseFloat(order.amount).toFixed(2) + '€' : '—';
  const email = order.email || order.customerEmail || 'Anonyme';
  const date = new Date().toLocaleString('fr-FR');

  return new EmbedBuilder()
    .setTitle('💰 Nouvelle Vente !')
    .setColor(colorToInt('#23D18B'))
    .addFields(
      { name: '📦 Produit', value: product, inline: true },
      { name: '💵 Montant', value: `**${amount}**`, inline: true },
      { name: '📧 Client', value: email, inline: true },
      { name: '📅 Date', value: date, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Sellhub • Paiement reçu' });
}

// ─── TICKET SYSTEM ───────────────────────────────────────────
async function createTicket(guild, user) {
  // Check if user already has a ticket
  if (ticketMap.has(user.id)) {
    const existing = guild.channels.cache.get(ticketMap.get(user.id));
    if (existing) return { already: true, channel: existing };
  }

  const ticketNum = Math.floor(Math.random() * 9000) + 1000;
  const chName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${ticketNum}`;

  const permOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];

  if (CONFIG.roles.support) {
    const supportRole = guild.roles.cache.get(CONFIG.roles.support);
    if (supportRole) {
      permOverwrites.push({
        id: CONFIG.roles.support,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
      });
    }
  }

  const chOptions = {
    name: chName,
    type: ChannelType.GuildText,
    topic: `Ticket de ${user.username} (${user.id})`,
    permissionOverwrites: permOverwrites,
  };

  if (CONFIG.channels.tickets) {
    const cat = guild.channels.cache.get(CONFIG.channels.tickets);
    if (cat) chOptions.parent = CONFIG.channels.tickets;
  }

  const channel = await guild.channels.create(chOptions);
  ticketMap.set(user.id, channel.id);

  const welcomeEmbed = new EmbedBuilder()
    .setTitle('🎫 Ticket de Support')
    .setDescription(`Bonjour ${user}, merci d'avoir ouvert un ticket !\n\nNotre équipe va vous répondre rapidement. En attendant, décrivez votre demande.`)
    .setColor(colorToInt('#5865F2'))
    .addFields(
      { name: '📋 Catégories', value: '📦 Commande\n🔧 Support technique\n❓ Question générale', inline: true },
      { name: '⏱️ Temps de réponse', value: 'Généralement < 24h', inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Cliquez sur Fermer pour fermer ce ticket' });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('🔒 Fermer le ticket')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${user}`, embeds: [welcomeEmbed], components: [closeRow] });

  // Log
  if (CONFIG.channels.logs) {
    const logCh = guild.channels.cache.get(CONFIG.channels.logs);
    if (logCh) {
      logCh.send({ embeds: [new EmbedBuilder().setTitle('📋 Nouveau Ticket').setColor(colorToInt('#FAA61A')).addFields({ name: 'Utilisateur', value: `${user} (${user.id})` },{ name: 'Channel', value: `<#${channel.id}>` }).setTimestamp()] });
    }
  }

  return { channel, ticketNum };
}

async function closeTicket(channel, closer) {
  // Find owner from topic
  const topic = channel.topic || '';
  const match = topic.match(/\((\d+)\)/);
  const ownerId = match ? match[1] : null;
  if (ownerId) ticketMap.delete(ownerId);

  const closeEmbed = new EmbedBuilder()
    .setTitle('🔒 Ticket Fermé')
    .setDescription(`Ce ticket a été fermé par ${closer}.`)
    .setColor(colorToInt('#F04747'))
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed] });

  // Log
  const guild = channel.guild;
  if (CONFIG.channels.logs) {
    const logCh = guild.channels.cache.get(CONFIG.channels.logs);
    if (logCh) {
      logCh.send({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Fermé').setColor(colorToInt('#F04747')).addFields({ name: 'Channel', value: channel.name },{ name: 'Fermé par', value: `${closer}` }).setTimestamp()] });
    }
  }

  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

// ─── TICKET PANEL ─────────────────────────────────────────────
async function sendTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('🎫 Centre de Support')
    .setDescription('Besoin d\'aide ? Cliquez sur le bouton ci-dessous pour ouvrir un ticket.\n\n📦 **Commande** — Problème avec votre achat\n🔧 **Support** — Aide technique\n❓ **Question** — Renseignements généraux')
    .setColor(colorToInt('#5865F2'))
    .setTimestamp()
    .setFooter({ text: 'NexusBot Support System' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_ticket')
      .setLabel('🎫 Ouvrir un Ticket')
      .setStyle(ButtonStyle.Primary)
  );

  return channel.send({ embeds: [embed], components: [row] });
}

// ─── EVENTS ──────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log(`\n✅ Bot connecté : ${client.user.tag}`);
  console.log(`📡 Serveur : ${CONFIG.guildId}`);
  client.user.setActivity('🛒 Boutique Sellhub', { type: 3 }); // WATCHING
  await registerCommands();
  await fetchSellhubProducts();
  // Refresh products every 5 min
  setInterval(fetchSellhubProducts, 5 * 60 * 1000);
});

// ─── MEMBER JOIN ─────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async member => {
  // Welcome message
  if (CONFIG.channels.welcome) {
    const ch = member.guild.channels.cache.get(CONFIG.channels.welcome);
    if (ch) {
      const msg = CONFIG.messages.welcome
        .replace('{user}', member.toString())
        .replace('{server}', member.guild.name)
        .replace('{shop}', CONFIG.channels.shop || '');

      const embed = new EmbedBuilder()
        .setTitle(`👋 Bienvenue sur ${member.guild.name} !`)
        .setDescription(msg)
        .setColor(colorToInt('#5865F2'))
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields({ name: '👥 Membre n°', value: `${member.guild.memberCount}`, inline: true })
        .setTimestamp();

      ch.send({ embeds: [embed] });
    }
  }

  // Auto-role
  if (CONFIG.roles.member) {
    const role = member.guild.roles.cache.get(CONFIG.roles.member);
    if (role) member.roles.add(role).catch(console.error);
  }
});

// ─── MEMBER LEAVE ────────────────────────────────────────────
client.on(Events.GuildMemberRemove, async member => {
  if (CONFIG.channels.bye) {
    const ch = member.guild.channels.cache.get(CONFIG.channels.bye);
    if (ch) {
      const msg = CONFIG.messages.bye
        .replace('{user}', member.user.username)
        .replace('{server}', member.guild.name);
      ch.send({ embeds: [new EmbedBuilder().setDescription(msg).setColor(colorToInt('#F04747')).setTimestamp()] });
    }
  }
});

// ─── BUTTON INTERACTIONS ─────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  // ── BUTTON ──────────────────────────────────────────────────
  if (interaction.isButton()) {
    // Open ticket
    if (interaction.customId === 'open_ticket') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await createTicket(interaction.guild, interaction.user);
        if (result.already) {
          return interaction.editReply({ content: `❌ Tu as déjà un ticket ouvert : <#${result.channel.id}>` });
        }
        return interaction.editReply({ content: `✅ Ton ticket a été créé : <#${result.channel.id}>` });
      } catch (err) {
        console.error(err);
        return interaction.editReply({ content: `❌ Erreur : ${err.message}` });
      }
    }

    // Close ticket
    if (interaction.customId === 'close_ticket') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ content: '❌ Ce n\'est pas un channel ticket.', ephemeral: true });
      }
      await interaction.reply({ content: '🔒 Fermeture du ticket dans 5 secondes...' });
      await closeTicket(interaction.channel, interaction.user);
    }
    return;
  }

  // ── SLASH COMMANDS ─────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // /ping
  if (commandName === 'ping') {
    const latency = Date.now() - interaction.createdTimestamp;
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🏓 Pong !')
        .addFields(
          { name: '⚡ Latence', value: `${latency}ms`, inline: true },
          { name: '💓 API', value: `${Math.round(client.ws.ping)}ms`, inline: true }
        )
        .setColor(colorToInt('#23D18B'))]
    });
  }

  // /shop
  if (commandName === 'shop') {
    await interaction.deferReply();
    if (!shopProducts.length) await fetchSellhubProducts();
    return interaction.editReply({ embeds: [shopEmbed(shopProducts)] });
  }

  // /produit
  if (commandName === 'produit') {
    await interaction.deferReply();
    const nom = interaction.options.getString('nom').toLowerCase();
    if (!shopProducts.length) await fetchSellhubProducts();
    const product = shopProducts.find(p => (p.name || p.title || '').toLowerCase().includes(nom));
    if (!product) return interaction.editReply({ content: `❌ Produit "${nom}" introuvable. Utilisez \`/shop\` pour voir tous les produits.` });
    return interaction.editReply({ embeds: [productEmbed(product)] });
  }

  // /regles
  if (commandName === 'regles') {
    const embed = new EmbedBuilder()
      .setTitle('📜 Règles du Serveur')
      .setColor(colorToInt('#E74C3C'))
      .setDescription('Voici les règles que tous les membres doivent respecter.')
      .addFields(
        { name: '1️⃣ Respect', value: 'Soyez respectueux envers tous les membres et le staff. Aucune insulte, discrimination ou harcèlement ne sera toléré.' },
        { name: '2️⃣ Pas de spam', value: 'Ne spammez pas les channels. Un message suffit. Pas de flood, de répétitions ou de majuscules excessives.' },
        { name: '3️⃣ Contenu approprié', value: 'Pas de contenu NSFW, de violence graphique ou de contenu choquant en dehors des channels dédiés.' },
        { name: '4️⃣ Pas de pub non autorisée', value: 'Aucune publicité, lien externe ou promotion sans autorisation du staff.' },
        { name: '5️⃣ Pas d\'arnaque', value: 'Toute tentative d\'escroquerie, de phishing ou de vol sera sanctionnée par un ban permanent.' },
        { name: '6️⃣ Pseudo & Avatar', value: 'Votre pseudo et avatar doivent être appropriés et ne pas contenir de caractères illisibles.' },
        { name: '7️⃣ Langue', value: 'Utilisez le français dans les channels généraux. Langues étrangères acceptées dans les channels dédiés.' },
        { name: '8️⃣ Tickets', value: 'Pour tout litige ou question, utilisez le système de tickets. Ne contactez pas le staff en DM sans autorisation.' },
      )
      .setTimestamp()
      .setFooter({ text: 'Le non-respect des règles entraîne des sanctions.' });

    return interaction.reply({ embeds: [embed] });
  }

  // /ticket
  if (commandName === 'ticket') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await createTicket(interaction.guild, interaction.user);
      if (result.already) {
        return interaction.editReply({ content: `❌ Tu as déjà un ticket ouvert : <#${result.channel.id}>` });
      }
      return interaction.editReply({ content: `✅ Ticket créé : <#${result.channel.id}>` });
    } catch (err) {
      return interaction.editReply({ content: `❌ ${err.message}` });
    }
  }

  // /fermer
  if (commandName === 'fermer') {
    if (!interaction.channel.name.startsWith('ticket-')) {
      return interaction.reply({ content: '❌ Cette commande ne fonctionne que dans un ticket.', ephemeral: true });
    }
    await interaction.reply({ content: '🔒 Fermeture dans 5 secondes...' });
    await closeTicket(interaction.channel, interaction.user);
    return;
  }

  // /info
  if (commandName === 'info') {
    const guild = interaction.guild;
    await guild.fetch();
    const embed = new EmbedBuilder()
      .setTitle(`ℹ️ ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setColor(colorToInt('#5865F2'))
      .addFields(
        { name: '👥 Membres', value: `${guild.memberCount}`, inline: true },
        { name: '📅 Créé le', value: guild.createdAt.toLocaleDateString('fr-FR'), inline: true },
        { name: '🎭 Rôles', value: `${guild.roles.cache.size}`, inline: true },
        { name: '# Channels', value: `${guild.channels.cache.size}`, inline: true },
        { name: '🚀 Boosts', value: `${guild.premiumSubscriptionCount || 0} (Niveau ${guild.premiumTier})`, inline: true },
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  // /donner-role
  if (commandName === 'donner-role') {
    const member = interaction.options.getMember('membre');
    const role = interaction.options.getRole('role');
    try {
      await member.roles.add(role);
      return interaction.reply({ content: `✅ Rôle **${role.name}** donné à ${member}.`, ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `❌ Impossible : ${err.message}`, ephemeral: true });
    }
  }

  // /retirer-role
  if (commandName === 'retirer-role') {
    const member = interaction.options.getMember('membre');
    const role = interaction.options.getRole('role');
    try {
      await member.roles.remove(role);
      return interaction.reply({ content: `✅ Rôle **${role.name}** retiré de ${member}.`, ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `❌ Impossible : ${err.message}`, ephemeral: true });
    }
  }

  // /clear
  if (commandName === 'clear') {
    const amount = interaction.options.getInteger('nombre');
    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);
      return interaction.reply({ content: `✅ ${deleted.size} messages supprimés.`, ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  }

  // /annonce
  if (commandName === 'annonce') {
    const message = interaction.options.getString('message');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const embed = new EmbedBuilder()
      .setTitle('📢 Annonce')
      .setDescription(message)
      .setColor(colorToInt('#5865F2'))
      .setTimestamp()
      .setFooter({ text: `Annoncé par ${interaction.user.username}` });
    await targetChannel.send({ embeds: [embed] });
    return interaction.reply({ content: `✅ Annonce envoyée dans ${targetChannel}.`, ephemeral: true });
  }

  // /embed
  if (commandName === 'embed') {
    const titre = interaction.options.getString('titre');
    const desc = interaction.options.getString('description') || '';
    const couleur = interaction.options.getString('couleur') || '#5865F2';
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const embed = new EmbedBuilder()
      .setTitle(titre)
      .setColor(colorToInt(couleur))
      .setTimestamp();
    if (desc) embed.setDescription(desc);
    await targetChannel.send({ embeds: [embed] });
    return interaction.reply({ content: `✅ Embed envoyé dans ${targetChannel}.`, ephemeral: true });
  }

  // /commande
  if (commandName === 'commande') {
    await interaction.deferReply({ ephemeral: true });
    const email = interaction.options.getString('email');
    if (!CONFIG.sellhubKey) {
      return interaction.editReply({ content: '❌ Clé API Sellhub non configurée.' });
    }
    try {
      const res = await fetch(`https://dash.sellhub.cx/api/sellhub/orders?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: CONFIG.sellhubKey }
      });
      const data = await res.json();
      const orders = data.data || data.orders || [];
      if (!orders.length) return interaction.editReply({ content: `❌ Aucune commande trouvée pour **${email}**.` });

      const embed = new EmbedBuilder()
        .setTitle(`📦 Commandes de ${email}`)
        .setColor(colorToInt('#23D18B'));
      orders.slice(0, 5).forEach(o => {
        const product = o.product?.name || o.productName || '—';
        const amount = o.amount != null ? parseFloat(o.amount).toFixed(2) + '€' : '—';
        const status = o.status || 'pending';
        embed.addFields({ name: product, value: `${amount} • ${status}`, inline: false });
      });
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({ content: `❌ Erreur API : ${err.message}` });
    }
  }
});

// ─── SELLHUB WEBHOOK SERVER ───────────────────────────────────
function startWebhookServer() {
  const app = express();
  app.use(express.json());
  app.use(express.raw({ type: '*/*' }));

  // Sellhub webhook endpoint
  app.post('/sellhub-webhook', async (req, res) => {
    res.status(200).json({ received: true });

    try {
      const body = req.body;
      const event = body.event || body.type || 'unknown';
      console.log('📦 Sellhub webhook reçu:', event);

      // New order / payment completed
      if (event === 'order.created' || event === 'order.completed' || event === 'payment.completed') {
        const order = body.data || body;

        if (CONFIG.channels.sales) {
          const guild = client.guilds.cache.get(CONFIG.guildId);
          if (guild) {
            const ch = guild.channels.cache.get(CONFIG.channels.sales);
            if (ch) {
              await ch.send({ embeds: [saleEmbed(order)] });
              console.log('💰 Notification vente envoyée sur Discord');
            }
          }
        }

        // Give VIP role if Discord ID in order
        const discordId = order.discordId || order.discord_id || order.customFields?.discord;
        if (discordId && CONFIG.roles.vip) {
          const guild = client.guilds.cache.get(CONFIG.guildId);
          if (guild) {
            const member = await guild.members.fetch(discordId).catch(() => null);
            if (member) {
              const role = guild.roles.cache.get(CONFIG.roles.vip);
              if (role) {
                await member.roles.add(role);
                console.log(`👑 Rôle VIP donné à ${member.user.username}`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('❌ Webhook error:', err.message);
    }
  });

  // Discord webhook proxy (forward to Discord)
  app.post('/discord-webhook/:id/:token', async (req, res) => {
    try {
      const { id, token } = req.params;
      const r = await fetch(`https://discord.com/api/webhooks/${id}/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      res.status(r.status).json({ ok: r.ok });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/', (req, res) => res.json({ status: 'ok', bot: client.user?.tag || 'starting' }));

  app.listen(CONFIG.webhookPort, () => {
    console.log(`🌐 Serveur webhook : http://localhost:${CONFIG.webhookPort}`);
    console.log(`   Sellhub → POST http://VOTRE_IP:${CONFIG.webhookPort}/sellhub-webhook`);
  });
}

// ─── UTILITY COMMANDS VIA PREFIX (!) ─────────────────────────
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;
  const [cmd, ...args] = message.content.slice(1).split(' ');

  if (cmd === 'setup-tickets') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;
    await sendTicketPanel(message.channel);
    message.delete().catch(() => {});
  }

  if (cmd === 'setup-shop') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;
    await fetchSellhubProducts();
    await message.channel.send({ embeds: [shopEmbed(shopProducts)] });
    message.delete().catch(() => {});
  }
});

// ─── START ────────────────────────────────────────────────────
startWebhookServer();
client.login(process.env.TOKEN).catch(err => {
  console.error('❌ Erreur connexion bot:', err.message);
  process.exit(1);
});
