// ═══════════════════════════════════════════════════════════════
//  NexusBot v2 — Bot Discord Ultra Complet
//
//  ✅ 30+ Slash Commands
//  ✅ Commandes personnalisées (créer/modifier/supprimer depuis Discord)
//  ✅ Système de candidatures / applications
//  ✅ Giveaways
//  ✅ Économie (points, classement)
//  ✅ Modération complète (warn, mute, ban, kick)
//  ✅ Tickets avec catégories
//  ✅ Auto-rôles, bienvenue, au revoir
//  ✅ Sondages
//  ✅ Sellhub intégré
//
//  Variables Railway requises :
//  DISCORD_TOKEN, CLIENT_ID, GUILD_ID
//  Optionnelles : SELLHUB_KEY, STORE_URL
//  Channels : CH_WELCOME, CH_BYE, CH_SALES, CH_LOGS
//  Rôles : ROLE_MEMBER, ROLE_VIP, ROLE_SUPPORT, ROLE_MUTED
// ═══════════════════════════════════════════════════════════════

const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, ChannelType, REST, Routes,
  SlashCommandBuilder, Events, Collection
} = require('discord.js');
const express = require('express');

// ─── CONFIG ─────────────────────────────────────────────────
const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;
const SH_KEY    = process.env.SELLHUB_KEY || '';
const PORT      = process.env.PORT || 3000;
const STORE_URL = process.env.STORE_URL || '';

const CH_WELCOME = process.env.CH_WELCOME || '';
const CH_BYE     = process.env.CH_BYE     || '';
const CH_SALES   = process.env.CH_SALES   || '';
const CH_LOGS    = process.env.CH_LOGS    || '';
const CH_TICKETS = process.env.CH_TICKETS || '';

const ROLE_MEMBER  = process.env.ROLE_MEMBER  || '';
const ROLE_VIP     = process.env.ROLE_VIP     || '';
const ROLE_SUPPORT = process.env.ROLE_SUPPORT || '';
const ROLE_MUTED   = process.env.ROLE_MUTED   || '';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Variables manquantes : DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

// ─── BASE DE DONNÉES (en mémoire — persiste pendant que le bot tourne) ──
const db = {
  // Commandes personnalisées : { nom: { reponse, auteur, date } }
  customCmds: {},
  // Warns : { userId: [ { reason, modId, date } ] }
  warns: {},
  // Économie : { userId: { points, lastDaily } }
  economy: {},
  // Giveaways : { messageId: { prize, end, channel, entries: Set, winner } }
  giveaways: {},
  // Applications : [ { userId, username, answers, date, status } ]
  applications: [],
  // Sondages : { messageId: { question, options, votes: {optionIndex: [userId]} } }
  polls: {},
  // Produits Sellhub cache
  products: [],
};

// ─── HELPERS ────────────────────────────────────────────────
const C = h => parseInt((h || '#5865F2').replace('#', ''), 16);
const log = msg => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`);

function successEmbed(title, desc) {
  return new EmbedBuilder().setTitle(`✅ ${title}`).setDescription(desc).setColor(C('#23D18B')).setTimestamp();
}
function errorEmbed(desc) {
  return new EmbedBuilder().setTitle('❌ Erreur').setDescription(desc).setColor(C('#F04747')).setTimestamp();
}
function infoEmbed(title, desc) {
  return new EmbedBuilder().setTitle(`ℹ️ ${title}`).setDescription(desc).setColor(C('#5865F2')).setTimestamp();
}

function getEconomy(userId) {
  if (!db.economy[userId]) db.economy[userId] = { points: 0, lastDaily: 0, totalEarned: 0 };
  return db.economy[userId];
}

function addPoints(userId, amount) {
  const e = getEconomy(userId);
  e.points += amount;
  e.totalEarned += amount;
  return e.points;
}

// ─── SLASH COMMANDS DÉFINITIONS ─────────────────────────────
const COMMANDS = [
  // ── GÉNÉRAL ──
  new SlashCommandBuilder().setName('ping').setDescription('🏓 Latence du bot'),
  new SlashCommandBuilder().setName('info').setDescription('ℹ️ Infos sur le serveur'),
  new SlashCommandBuilder().setName('profil').setDescription('👤 Voir le profil d\'un membre').addUserOption(o => o.setName('membre').setDescription('Membre (optionnel)')),
  new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Voir l\'avatar d\'un membre').addUserOption(o => o.setName('membre').setDescription('Membre (optionnel)')),
  new SlashCommandBuilder().setName('aide').setDescription('📋 Liste de toutes les commandes'),

  // ── BOUTIQUE ──
  new SlashCommandBuilder().setName('shop').setDescription('🛒 Affiche la boutique Sellhub'),
  new SlashCommandBuilder().setName('produit').setDescription('🛒 Détails d\'un produit').addStringOption(o => o.setName('nom').setDescription('Nom du produit').setRequired(true)),
  new SlashCommandBuilder().setName('commande').setDescription('📦 Vérifier une commande').addStringOption(o => o.setName('email').setDescription('Email de commande').setRequired(true)),

  // ── MODÉRATION ──
  new SlashCommandBuilder().setName('warn').setDescription('⚠️ Avertir un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),
  new SlashCommandBuilder().setName('warns').setDescription('📋 Voir les avertissements').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('clearwarns').setDescription('🗑️ Supprimer les warns d\'un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('👢 Expulser un membre').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('ban').setDescription('🔨 Bannir un membre').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('unban').setDescription('🔓 Débannir un utilisateur').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption(o => o.setName('userid').setDescription('ID de l\'utilisateur').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('🔇 Rendre muet un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('Durée en minutes (défaut: 10)')).addStringOption(o => o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('unmute').setDescription('🔊 Rendre la parole').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('🗑️ Supprimer des messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o => o.setName('nombre').setDescription('Nombre (max 100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('lock').setDescription('🔒 Verrouiller un channel').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('🔓 Déverrouiller un channel').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('slowmode').setDescription('🐌 Définir le slow mode').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addIntegerOption(o => o.setName('secondes').setDescription('Secondes (0 = désactiver)').setRequired(true).setMinValue(0).setMaxValue(21600)),

  // ── ANNONCES ──
  new SlashCommandBuilder().setName('annonce').setDescription('📢 Envoyer une annonce embed').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(true)).addStringOption(o => o.setName('message').setDescription('Contenu').setRequired(true)).addChannelOption(o => o.setName('channel').setDescription('Channel cible')).addStringOption(o => o.setName('mention').setDescription('@everyone ou @here')).addStringOption(o => o.setName('couleur').setDescription('Couleur hex ex: #FF0000')),
  new SlashCommandBuilder().setName('embed').setDescription('✨ Envoyer un embed personnalisé').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(true)).addStringOption(o => o.setName('description').setDescription('Description')).addStringOption(o => o.setName('couleur').setDescription('Couleur hex')).addChannelOption(o => o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('regles').setDescription('📜 Affiche les règles du serveur'),

  // ── COMMANDES PERSO ──
  new SlashCommandBuilder().setName('cmd-ajouter').setDescription('➕ Créer une commande personnalisée').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName('nom').setDescription('Nom de la commande (sans /)').setRequired(true)).addStringOption(o => o.setName('reponse').setDescription('Réponse du bot').setRequired(true)),
  new SlashCommandBuilder().setName('cmd-supprimer').setDescription('➖ Supprimer une commande personnalisée').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName('nom').setDescription('Nom de la commande').setRequired(true)),
  new SlashCommandBuilder().setName('cmd-liste').setDescription('📋 Liste des commandes personnalisées'),
  new SlashCommandBuilder().setName('cmd').setDescription('▶️ Utiliser une commande personnalisée').addStringOption(o => o.setName('nom').setDescription('Nom de la commande').setRequired(true)),

  // ── TICKETS ──
  new SlashCommandBuilder().setName('ticket').setDescription('🎫 Ouvrir un ticket de support'),
  new SlashCommandBuilder().setName('fermer').setDescription('🔒 Fermer le ticket actuel'),
  new SlashCommandBuilder().setName('add').setDescription('➕ Ajouter un membre au ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),

  // ── ÉCONOMIE ──
  new SlashCommandBuilder().setName('points').setDescription('💰 Voir vos points').addUserOption(o => o.setName('membre').setDescription('Membre (optionnel)')),
  new SlashCommandBuilder().setName('daily').setDescription('🎁 Récupérer vos points quotidiens'),
  new SlashCommandBuilder().setName('classement').setDescription('🏆 Top 10 des membres les plus riches'),
  new SlashCommandBuilder().setName('donner-points').setDescription('💸 Donner des points à un membre').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),

  // ── GIVEAWAY ──
  new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Créer un giveaway').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName('prix').setDescription('Ce qu\'on gagne').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1)).addChannelOption(o => o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('giveaway-terminer').setDescription('🏁 Terminer un giveaway maintenant').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName('messageid').setDescription('ID du message giveaway').setRequired(true)),
  new SlashCommandBuilder().setName('giveaway-reroll').setDescription('🔄 Retirer un nouveau gagnant').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName('messageid').setDescription('ID du message giveaway').setRequired(true)),

  // ── SONDAGES ──
  new SlashCommandBuilder().setName('sondage').setDescription('📊 Créer un sondage').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName('question').setDescription('Question').setRequired(true)).addStringOption(o => o.setName('options').setDescription('Options séparées par | ex: Oui|Non|Peut-être').setRequired(true)),

  // ── CANDIDATURES ──
  new SlashCommandBuilder().setName('postuler').setDescription('📝 Postuler pour rejoindre l\'équipe'),
  new SlashCommandBuilder().setName('candidatures').setDescription('📋 Voir les candidatures').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // ── RÔLES ──
  new SlashCommandBuilder().setName('donner-role').setDescription('🎭 Donner un rôle').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('retirer-role').setDescription('🎭 Retirer un rôle').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),

].map(c => c.toJSON());

// ─── CLIENT ─────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction],
});

const ticketMap = new Map();

// ─── REGISTER COMMANDS ──────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: COMMANDS });
    log(`✅ ${COMMANDS.length} slash commands enregistrées`);
  } catch (e) {
    log(`❌ Slash commands: ${e.message}`);
  }
}

// ─── SELLHUB ────────────────────────────────────────────────
async function fetchProducts() {
  if (!SH_KEY) return;
  try {
    const res = await fetch('https://dash.sellhub.cx/api/sellhub/products', { headers: { Authorization: SH_KEY } });
    const data = await res.json();
    db.products = data.data || data.products || (Array.isArray(data) ? data : []);
    log(`🛒 ${db.products.length} produits Sellhub`);
  } catch (e) { log(`⚠️ Sellhub: ${e.message}`); }
}

function shopEmbed() {
  const emb = new EmbedBuilder().setTitle('🛒 Boutique').setColor(C('#635BFF')).setTimestamp().setFooter({ text: 'Paiement sécurisé • Sellhub' });
  if (!db.products.length) { emb.setDescription('Aucun produit disponible.'); return emb; }
  db.products.slice(0, 10).forEach(p => {
    const name = p.name || p.title || 'Produit';
    const price = p.price != null ? parseFloat(p.price).toFixed(2) + '€' : '—';
    const link = p.url || p.checkoutUrl || STORE_URL;
    const stock = p.stock != null ? (p.stock === 0 ? '❌ Rupture' : `✅ ${p.stock}`) : '✅';
    emb.addFields({ name: `${name} — ${price}`, value: `${stock}${link ? `\n[**→ Acheter**](${link})` : ''}`, inline: true });
  });
  if (STORE_URL) emb.addFields({ name: '\u200b', value: `[🌐 Voir toute la boutique](${STORE_URL})`, inline: false });
  return emb;
}

// ─── TICKET SYSTEM ──────────────────────────────────────────
async function createTicket(guild, user) {
  if (ticketMap.has(user.id)) {
    const existing = guild.channels.cache.get(ticketMap.get(user.id));
    if (existing) return { already: true, channel: existing };
  }
  const num = Math.floor(Math.random() * 9000) + 1000;
  const chName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${num}`;
  const perms = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (ROLE_SUPPORT) perms.push({ id: ROLE_SUPPORT, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  const opts = { name: chName, type: ChannelType.GuildText, topic: `Ticket de ${user.username} (${user.id})`, permissionOverwrites: perms };
  if (CH_TICKETS) { const cat = guild.channels.cache.get(CH_TICKETS); if (cat) opts.parent = CH_TICKETS; }
  const channel = await guild.channels.create(opts);
  ticketMap.set(user.id, channel.id);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('claim_ticket').setLabel('✋ Prendre en charge').setStyle(ButtonStyle.Success)
  );
  await channel.send({
    content: `${user}${ROLE_SUPPORT ? ` <@&${ROLE_SUPPORT}>` : ''}`,
    embeds: [new EmbedBuilder().setTitle('🎫 Nouveau Ticket').setDescription(`Bonjour ${user} ! Décrivez votre demande, notre équipe vous répond rapidement.`).setColor(C('#5865F2')).addFields({ name: '📋 Catégories', value: '📦 Commande\n🔧 Support technique\n❓ Question générale', inline: true }, { name: '⏱️ Réponse', value: 'Généralement < 24h', inline: true }).setTimestamp()],
    components: [row]
  });

  if (CH_LOGS) {
    const logCh = guild.channels.cache.get(CH_LOGS);
    if (logCh) logCh.send({ embeds: [new EmbedBuilder().setTitle('📋 Nouveau Ticket').setColor(C('#FAA61A')).addFields({ name: 'Utilisateur', value: `${user} (${user.id})` }, { name: 'Channel', value: `<#${channel.id}>` }).setTimestamp()] });
  }
  addPoints(user.id, 5);
  return { channel };
}

async function closeTicket(channel, closer) {
  const match = (channel.topic || '').match(/\((\d+)\)/);
  if (match) ticketMap.delete(match[1]);
  await channel.send({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Fermé').setDescription(`Fermé par ${closer}. Suppression dans 5 secondes.`).setColor(C('#F04747')).setTimestamp()] });
  if (CH_LOGS) {
    const logCh = channel.guild.channels.cache.get(CH_LOGS);
    if (logCh) logCh.send({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Fermé').setColor(C('#F04747')).addFields({ name: 'Channel', value: channel.name }, { name: 'Fermé par', value: `${closer}` }).setTimestamp()] });
  }
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

// ─── GIVEAWAY ───────────────────────────────────────────────
async function endGiveaway(messageId, guild) {
  const gw = db.giveaways[messageId];
  if (!gw || gw.ended) return;
  gw.ended = true;
  const ch = guild.channels.cache.get(gw.channel);
  if (!ch) return;
  const entries = [...gw.entries];
  if (!entries.length) {
    ch.send({ embeds: [new EmbedBuilder().setTitle('🎉 Giveaway Terminé').setDescription(`**${gw.prize}**\n\nPersonne n'a participé... 😢`).setColor(C('#F04747')).setTimestamp()] });
    return;
  }
  const winner = entries[Math.floor(Math.random() * entries.length)];
  gw.winner = winner;
  addPoints(winner, 100);
  ch.send({ content: `🎉 <@${winner}>`, embeds: [new EmbedBuilder().setTitle('🎉 Giveaway Terminé !').setDescription(`**Prix :** ${gw.prize}\n**Gagnant :** <@${winner}>`).setColor(C('#23D18B')).addFields({ name: '🏆 Félicitations !', value: `<@${winner}> a gagné **${gw.prize}** et reçoit 100 points !` }).setTimestamp()] });
}

// ─── EVENTS ─────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  log(`✅ Bot connecté : ${client.user.tag}`);
  client.user.setActivity('🛒 NexusStore | /aide', { type: 3 });
  await registerCommands();
  await fetchProducts();
  setInterval(fetchProducts, 5 * 60 * 1000);

  // Vérification des giveaways expirés
  setInterval(() => {
    const now = Date.now();
    Object.entries(db.giveaways).forEach(([msgId, gw]) => {
      if (!gw.ended && gw.end <= now) {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) endGiveaway(msgId, guild);
      }
    });
  }, 10000);
});

// Bienvenue & auto-rôle
client.on(Events.GuildMemberAdd, async member => {
  if (CH_WELCOME) {
    const ch = member.guild.channels.cache.get(CH_WELCOME);
    if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle(`👋 Bienvenue sur ${member.guild.name} !`).setDescription(`Bienvenue **${member.user.username}** ! 🎉\n\nTu es le membre **#${member.guild.memberCount}** !\n\n🛒 Découvrez notre boutique avec \`/shop\`\n🎫 Besoin d'aide ? Utilisez \`/ticket\`\n📜 Lisez les règles avec \`/regles\``).setColor(C('#5865F2')).setThumbnail(member.user.displayAvatarURL({ dynamic: true })).setTimestamp()] });
  }
  if (ROLE_MEMBER) {
    const role = member.guild.roles.cache.get(ROLE_MEMBER);
    if (role) member.roles.add(role).catch(() => {});
  }
  addPoints(member.id, 10);
});

client.on(Events.GuildMemberRemove, async member => {
  if (CH_BYE) {
    const ch = member.guild.channels.cache.get(CH_BYE);
    if (ch) ch.send({ embeds: [new EmbedBuilder().setDescription(`👋 **${member.user.username}** a quitté le serveur. Il restait **${member.guild.memberCount}** membres.`).setColor(C('#F04747')).setTimestamp()] });
  }
});

// Réactions pour giveaways et sondages
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const msgId = reaction.message.id;

  // Giveaway
  if (db.giveaways[msgId] && reaction.emoji.name === '🎉') {
    db.giveaways[msgId].entries.add(user.id);
  }

  // Sondage
  if (db.polls[msgId]) {
    const poll = db.polls[msgId];
    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
    const idx = emojis.indexOf(reaction.emoji.name);
    if (idx >= 0 && idx < poll.options.length) {
      // Un seul vote par option
      Object.values(poll.votes).forEach(voters => {
        const i = voters.indexOf(user.id);
        if (i >= 0) voters.splice(i, 1);
      });
      poll.votes[idx].push(user.id);
    }
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  const msgId = reaction.message.id;
  if (db.giveaways[msgId] && reaction.emoji.name === '🎉') {
    db.giveaways[msgId].entries.delete(user.id);
  }
});

// ─── INTERACTIONS ───────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {

  // ── BOUTONS ──────────────────────────────────────────────
  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === 'open_ticket') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const r = await createTicket(interaction.guild, interaction.user);
        if (r.already) return interaction.editReply({ content: `❌ Ticket existant : <#${r.channel.id}>` });
        return interaction.editReply({ content: `✅ Ton ticket a été créé : <#${r.channel.id}>` });
      } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
    }

    if (id === 'close_ticket') {
      if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ content: '❌ Pas un ticket.', ephemeral: true });
      await interaction.reply({ content: '🔒 Fermeture dans 5 secondes...' });
      return closeTicket(interaction.channel, interaction.user);
    }

    if (id === 'claim_ticket') {
      await interaction.reply({ content: `✋ **${interaction.user.username}** prend en charge ce ticket.` });
      return;
    }

    if (id === 'giveaway_join') {
      const msgId = interaction.message.id;
      const gw = db.giveaways[msgId];
      if (!gw || gw.ended) return interaction.reply({ content: '❌ Ce giveaway est terminé.', ephemeral: true });
      if (gw.entries.has(interaction.user.id)) {
        gw.entries.delete(interaction.user.id);
        return interaction.reply({ content: '😔 Tu t\'es retiré du giveaway.', ephemeral: true });
      }
      gw.entries.add(interaction.user.id);
      return interaction.reply({ content: `🎉 Tu participes ! **${gw.entries.size}** participant(s).`, ephemeral: true });
    }

    if (id.startsWith('app_accept_') || id.startsWith('app_refuse_')) {
      const idx = parseInt(id.split('_')[2]);
      const app = db.applications[idx];
      if (!app) return interaction.reply({ content: '❌ Candidature introuvable.', ephemeral: true });
      const accepted = id.startsWith('app_accept_');
      app.status = accepted ? 'acceptée' : 'refusée';
      const user = await client.users.fetch(app.userId).catch(() => null);
      if (user) user.send({ embeds: [new EmbedBuilder().setTitle(accepted ? '✅ Candidature Acceptée !' : '❌ Candidature Refusée').setDescription(accepted ? `Félicitations ! Ta candidature sur **${interaction.guild.name}** a été acceptée. Bienvenue dans l\'équipe !` : `Ta candidature sur **${interaction.guild.name}** n'a pas été retenue cette fois. N\'hésite pas à réessayer !`).setColor(C(accepted ? '#23D18B' : '#F04747')).setTimestamp()] }).catch(() => {});
      await interaction.update({ components: [] });
      return interaction.followUp({ content: `${accepted ? '✅ Accepté' : '❌ Refusé'} : candidature de **${app.username}**`, ephemeral: true });
    }
    return;
  }

  // ── MODAL ────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'application_modal') {
      const answers = [
        interaction.fields.getTextInputValue('app_q1'),
        interaction.fields.getTextInputValue('app_q2'),
        interaction.fields.getTextInputValue('app_q3'),
      ];
      const app = { userId: interaction.user.id, username: interaction.user.username, answers, date: new Date().toLocaleString('fr-FR'), status: 'en attente' };
      db.applications.push(app);
      const idx = db.applications.length - 1;

      await interaction.reply({ embeds: [successEmbed('Candidature envoyée !', 'Ta candidature a bien été reçue. Tu recevras une réponse en DM.')], ephemeral: true });

      // Envoyer aux admins
      if (CH_LOGS) {
        const ch = interaction.guild.channels.cache.get(CH_LOGS);
        if (ch) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`app_accept_${idx}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`app_refuse_${idx}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger)
          );
          ch.send({
            embeds: [new EmbedBuilder().setTitle('📝 Nouvelle Candidature').setColor(C('#FAA61A')).setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })).addFields(
              { name: '👤 Candidat', value: `${interaction.user} (${interaction.user.id})` },
              { name: '❓ Pourquoi rejoindre l\'équipe ?', value: answers[0] },
              { name: '🎯 Expérience ?', value: answers[1] },
              { name: '📅 Disponibilité ?', value: answers[2] }
            ).setTimestamp()],
            components: [row]
          });
        }
      }
      return;
    }
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  // ── /ping ────────────────────────────────────────────────
  if (commandName === 'ping') {
    const lat = Date.now() - interaction.createdTimestamp;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏓 Pong !').setColor(C('#23D18B')).addFields({ name: '⚡ Latence bot', value: `\`${lat}ms\``, inline: true }, { name: '💓 API Discord', value: `\`${Math.round(client.ws.ping)}ms\``, inline: true }, { name: '⏱️ Uptime', value: `\`${Math.floor(client.uptime / 3600000)}h ${Math.floor((client.uptime % 3600000) / 60000)}m\``, inline: true }).setTimestamp()] });
  }

  // ── /aide ────────────────────────────────────────────────
  if (commandName === 'aide') {
    const emb = new EmbedBuilder().setTitle('📋 Toutes les commandes').setColor(C('#5865F2')).addFields(
      { name: '🌐 Général', value: '`/ping` `/info` `/profil` `/avatar` `/aide`', inline: false },
      { name: '🛒 Boutique', value: '`/shop` `/produit` `/commande`', inline: false },
      { name: '🛡️ Modération', value: '`/warn` `/warns` `/clearwarns` `/kick` `/ban` `/unban` `/mute` `/unmute` `/clear` `/lock` `/unlock` `/slowmode`', inline: false },
      { name: '📢 Annonces', value: '`/annonce` `/embed` `/regles`', inline: false },
      { name: '⚙️ Commandes perso', value: '`/cmd-ajouter` `/cmd-supprimer` `/cmd-liste` `/cmd`', inline: false },
      { name: '🎫 Tickets', value: '`/ticket` `/fermer` `/add`', inline: false },
      { name: '💰 Économie', value: '`/points` `/daily` `/classement` `/donner-points`', inline: false },
      { name: '🎉 Giveaway', value: '`/giveaway` `/giveaway-terminer` `/giveaway-reroll`', inline: false },
      { name: '📊 Sondages', value: '`/sondage`', inline: false },
      { name: '📝 Candidatures', value: '`/postuler` `/candidatures`', inline: false },
      { name: '🎭 Rôles', value: '`/donner-role` `/retirer-role`', inline: false },
    ).setFooter({ text: `${COMMANDS.length} commandes disponibles` }).setTimestamp();
    return interaction.reply({ embeds: [emb] });
  }

  // ── /info ────────────────────────────────────────────────
  if (commandName === 'info') {
    const g = interaction.guild;
    await g.fetch();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏠 ${g.name}`).setThumbnail(g.iconURL({ dynamic: true })).setColor(C('#5865F2')).addFields(
      { name: '👥 Membres', value: `${g.memberCount}`, inline: true },
      { name: '📅 Créé le', value: g.createdAt.toLocaleDateString('fr-FR'), inline: true },
      { name: '🎭 Rôles', value: `${g.roles.cache.size}`, inline: true },
      { name: '# Channels', value: `${g.channels.cache.size}`, inline: true },
      { name: '🚀 Boosts', value: `${g.premiumSubscriptionCount || 0} (Niv. ${g.premiumTier})`, inline: true },
      { name: '😀 Emojis', value: `${g.emojis.cache.size}`, inline: true },
    ).setTimestamp()] });
  }

  // ── /profil ──────────────────────────────────────────────
  if (commandName === 'profil') {
    const target = interaction.options.getMember('membre') || interaction.member;
    const user = target.user;
    const eco = getEconomy(user.id);
    const warns = (db.warns[user.id] || []).length;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${user.username}`).setThumbnail(user.displayAvatarURL({ dynamic: true })).setColor(C('#5865F2')).addFields(
      { name: '🏷️ Pseudo', value: user.username, inline: true },
      { name: '📅 Sur Discord depuis', value: user.createdAt.toLocaleDateString('fr-FR'), inline: true },
      { name: '📅 A rejoint le', value: target.joinedAt?.toLocaleDateString('fr-FR') || '?', inline: true },
      { name: '💰 Points', value: `${eco.points}`, inline: true },
      { name: '⚠️ Warns', value: `${warns}`, inline: true },
      { name: '🎭 Rôles', value: target.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.toString()).join(' ') || 'Aucun', inline: false },
    ).setTimestamp()] });
  }

  // ── /avatar ──────────────────────────────────────────────
  if (commandName === 'avatar') {
    const target = interaction.options.getUser('membre') || interaction.user;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ Avatar de ${target.username}`).setImage(target.displayAvatarURL({ dynamic: true, size: 1024 })).setColor(C('#5865F2')).addFields({ name: '🔗 Liens', value: `[PNG](${target.displayAvatarURL({ format: 'png', size: 1024 })}) | [WebP](${target.displayAvatarURL({ format: 'webp', size: 1024 })})` })] });
  }

  // ── /shop ────────────────────────────────────────────────
  if (commandName === 'shop') {
    await interaction.deferReply();
    if (!db.products.length) await fetchProducts();
    return interaction.editReply({ embeds: [shopEmbed()] });
  }

  // ── /produit ─────────────────────────────────────────────
  if (commandName === 'produit') {
    await interaction.deferReply();
    const nom = interaction.options.getString('nom').toLowerCase();
    if (!db.products.length) await fetchProducts();
    const p = db.products.find(x => (x.name || x.title || '').toLowerCase().includes(nom));
    if (!p) return interaction.editReply({ content: `❌ Produit "${nom}" introuvable. Utilisez \`/shop\` pour voir tous les produits.` });
    const link = p.url || p.checkoutUrl || STORE_URL;
    const emb = new EmbedBuilder().setTitle(`🛒 ${p.name || p.title}`).setDescription((p.description || '').replace(/<[^>]+>/g, '').substring(0, 400) || 'Aucune description.').setColor(C('#635BFF')).addFields(
      { name: '💰 Prix', value: `**${p.price != null ? parseFloat(p.price).toFixed(2) + '€' : '—'}**`, inline: true },
      { name: '📦 Stock', value: p.stock != null ? (p.stock === 0 ? '❌ Rupture' : `✅ ${p.stock} dispo`) : '✅ Disponible', inline: true },
      { name: '🔗 Acheter', value: link ? `[**Payer maintenant**](${link})` : 'Lien non disponible', inline: false }
    ).setTimestamp().setFooter({ text: 'Sellhub • Paiement sécurisé' });
    if (p.image || p.thumbnail) emb.setImage(p.image || p.thumbnail);
    return interaction.editReply({ embeds: [emb] });
  }

  // ── /commande ────────────────────────────────────────────
  if (commandName === 'commande') {
    await interaction.deferReply({ ephemeral: true });
    if (!SH_KEY) return interaction.editReply({ content: '❌ Clé Sellhub non configurée.' });
    const email = interaction.options.getString('email');
    try {
      const res = await fetch(`https://dash.sellhub.cx/api/sellhub/orders?email=${encodeURIComponent(email)}`, { headers: { Authorization: SH_KEY } });
      const data = await res.json();
      const orders = data.data || data.orders || [];
      if (!orders.length) return interaction.editReply({ content: `❌ Aucune commande pour **${email}**.` });
      const emb = new EmbedBuilder().setTitle(`📦 Commandes — ${email}`).setColor(C('#23D18B'));
      orders.slice(0, 5).forEach(o => emb.addFields({ name: o.product?.name || '—', value: `${o.amount ? parseFloat(o.amount).toFixed(2) + '€' : '—'} • ${o.status || 'pending'}`, inline: false }));
      return interaction.editReply({ embeds: [emb] });
    } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
  }

  // ── /warn ────────────────────────────────────────────────
  if (commandName === 'warn') {
    const target = interaction.options.getMember('membre');
    const raison = interaction.options.getString('raison');
    if (!db.warns[target.id]) db.warns[target.id] = [];
    db.warns[target.id].push({ reason: raison, modId: interaction.user.id, date: new Date().toLocaleString('fr-FR') });
    const total = db.warns[target.id].length;
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ Avertissement').setColor(C('#FAA61A')).addFields({ name: 'Membre', value: `${target}`, inline: true }, { name: 'Raison', value: raison, inline: true }, { name: 'Total warns', value: `${total}`, inline: true }).setTimestamp()] });
    target.send({ embeds: [new EmbedBuilder().setTitle('⚠️ Tu as reçu un avertissement').setDescription(`**Serveur :** ${interaction.guild.name}\n**Raison :** ${raison}\n**Total warns :** ${total}`).setColor(C('#FAA61A')).setTimestamp()] }).catch(() => {});
    if (CH_LOGS) {
      const ch = interaction.guild.channels.cache.get(CH_LOGS);
      if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('⚠️ Warn').setColor(C('#FAA61A')).addFields({ name: 'Membre', value: `${target.user.username} (${target.id})` }, { name: 'Raison', value: raison }, { name: 'Modérateur', value: interaction.user.username }).setTimestamp()] });
    }
    return;
  }

  // ── /warns ───────────────────────────────────────────────
  if (commandName === 'warns') {
    const target = interaction.options.getMember('membre');
    const warns = db.warns[target.id] || [];
    const emb = new EmbedBuilder().setTitle(`⚠️ Warns de ${target.user.username}`).setColor(C('#FAA61A'));
    if (!warns.length) { emb.setDescription('Aucun avertissement.'); }
    else warns.forEach((w, i) => emb.addFields({ name: `Warn #${i + 1} — ${w.date}`, value: `Raison : ${w.reason}`, inline: false }));
    return interaction.reply({ embeds: [emb] });
  }

  // ── /clearwarns ──────────────────────────────────────────
  if (commandName === 'clearwarns') {
    const target = interaction.options.getMember('membre');
    db.warns[target.id] = [];
    return interaction.reply({ embeds: [successEmbed('Warns supprimés', `Les avertissements de ${target} ont été supprimés.`)] });
  }

  // ── /kick ────────────────────────────────────────────────
  if (commandName === 'kick') {
    const target = interaction.options.getMember('membre');
    const raison = interaction.options.getString('raison') || 'Aucune raison';
    if (!target.kickable) return interaction.reply({ embeds: [errorEmbed('Je ne peux pas expulser ce membre.')], ephemeral: true });
    await target.kick(raison);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('👢 Membre expulsé').setColor(C('#F04747')).addFields({ name: 'Membre', value: target.user.username, inline: true }, { name: 'Raison', value: raison, inline: true }).setTimestamp()] });
    if (CH_LOGS) {
      const ch = interaction.guild.channels.cache.get(CH_LOGS);
      if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('👢 Kick').setColor(C('#F04747')).addFields({ name: 'Membre', value: `${target.user.username} (${target.id})` }, { name: 'Raison', value: raison }, { name: 'Modérateur', value: interaction.user.username }).setTimestamp()] });
    }
    return;
  }

  // ── /ban ─────────────────────────────────────────────────
  if (commandName === 'ban') {
    const target = interaction.options.getMember('membre');
    const raison = interaction.options.getString('raison') || 'Aucune raison';
    if (!target.bannable) return interaction.reply({ embeds: [errorEmbed('Je ne peux pas bannir ce membre.')], ephemeral: true });
    target.send({ embeds: [new EmbedBuilder().setTitle('🔨 Tu as été banni').setDescription(`**Serveur :** ${interaction.guild.name}\n**Raison :** ${raison}`).setColor(C('#F04747')).setTimestamp()] }).catch(() => {});
    await target.ban({ reason: raison });
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔨 Membre banni').setColor(C('#F04747')).addFields({ name: 'Membre', value: target.user.username, inline: true }, { name: 'Raison', value: raison, inline: true }).setTimestamp()] });
    if (CH_LOGS) {
      const ch = interaction.guild.channels.cache.get(CH_LOGS);
      if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('🔨 Ban').setColor(C('#F04747')).addFields({ name: 'Membre', value: `${target.user.username} (${target.id})` }, { name: 'Raison', value: raison }, { name: 'Modérateur', value: interaction.user.username }).setTimestamp()] });
    }
    return;
  }

  // ── /unban ───────────────────────────────────────────────
  if (commandName === 'unban') {
    const userId = interaction.options.getString('userid');
    try {
      await interaction.guild.members.unban(userId);
      return interaction.reply({ embeds: [successEmbed('Membre débanni', `L'utilisateur \`${userId}\` a été débanni.`)] });
    } catch (e) { return interaction.reply({ embeds: [errorEmbed(`Impossible de débannir : ${e.message}`)], ephemeral: true }); }
  }

  // ── /mute ────────────────────────────────────────────────
  if (commandName === 'mute') {
    const target = interaction.options.getMember('membre');
    const minutes = interaction.options.getInteger('minutes') || 10;
    const raison = interaction.options.getString('raison') || 'Aucune raison';
    try {
      await target.timeout(minutes * 60 * 1000, raison);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔇 Membre mis en sourdine').setColor(C('#FAA61A')).addFields({ name: 'Membre', value: `${target}`, inline: true }, { name: 'Durée', value: `${minutes} minute(s)`, inline: true }, { name: 'Raison', value: raison, inline: true }).setTimestamp()] });
    } catch (e) { return interaction.reply({ embeds: [errorEmbed(e.message)], ephemeral: true }); }
  }

  // ── /unmute ──────────────────────────────────────────────
  if (commandName === 'unmute') {
    const target = interaction.options.getMember('membre');
    try {
      await target.timeout(null);
      return interaction.reply({ embeds: [successEmbed('Sourdine levée', `${target} peut de nouveau parler.`)] });
    } catch (e) { return interaction.reply({ embeds: [errorEmbed(e.message)], ephemeral: true }); }
  }

  // ── /clear ───────────────────────────────────────────────
  if (commandName === 'clear') {
    const n = interaction.options.getInteger('nombre');
    try {
      const deleted = await interaction.channel.bulkDelete(n, true);
      return interaction.reply({ embeds: [successEmbed('Messages supprimés', `${deleted.size} message(s) supprimé(s).`)], ephemeral: true });
    } catch (e) { return interaction.reply({ embeds: [errorEmbed(e.message)], ephemeral: true }); }
  }

  // ── /lock ────────────────────────────────────────────────
  if (commandName === 'lock') {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔒 Channel verrouillé').setDescription('Les membres ne peuvent plus envoyer de messages.').setColor(C('#F04747')).setTimestamp()] });
  }

  // ── /unlock ──────────────────────────────────────────────
  if (commandName === 'unlock') {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔓 Channel déverrouillé').setDescription('Les membres peuvent de nouveau écrire.').setColor(C('#23D18B')).setTimestamp()] });
  }

  // ── /slowmode ────────────────────────────────────────────
  if (commandName === 'slowmode') {
    const sec = interaction.options.getInteger('secondes');
    await interaction.channel.setRateLimitPerUser(sec);
    return interaction.reply({ embeds: [successEmbed('Slow mode', sec === 0 ? 'Slow mode désactivé.' : `Slow mode réglé à ${sec} secondes.`)] });
  }

  // ── /annonce ─────────────────────────────────────────────
  if (commandName === 'annonce') {
    const titre = interaction.options.getString('titre');
    const message = interaction.options.getString('message');
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const mention = interaction.options.getString('mention') || '';
    const couleur = interaction.options.getString('couleur') || '#5865F2';
    const emb = new EmbedBuilder().setTitle(`📢 ${titre}`).setDescription(message).setColor(C(couleur)).setTimestamp().setFooter({ text: `Annoncé par ${interaction.user.username}` });
    await target.send({ content: mention || undefined, embeds: [emb] });
    return interaction.reply({ embeds: [successEmbed('Annonce envoyée', `Publiée dans ${target}.`)], ephemeral: true });
  }

  // ── /embed ───────────────────────────────────────────────
  if (commandName === 'embed') {
    const titre = interaction.options.getString('titre');
    const desc = interaction.options.getString('description') || '';
    const couleur = interaction.options.getString('couleur') || '#5865F2';
    const target = interaction.options.getChannel('channel') || interaction.channel;
    await target.send({ embeds: [new EmbedBuilder().setTitle(titre).setDescription(desc || undefined).setColor(C(couleur)).setTimestamp()] });
    return interaction.reply({ embeds: [successEmbed('Embed envoyé', `Publié dans ${target}.`)], ephemeral: true });
  }

  // ── /regles ──────────────────────────────────────────────
  if (commandName === 'regles') {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📜 Règles du Serveur').setColor(C('#E74C3C')).addFields(
      { name: '🤝 1. Respect', value: 'Aucune insulte, discrimination ou harcèlement envers les membres et le staff.', inline: false },
      { name: '🔇 2. Pas de spam', value: 'Ne spammez pas. Pas de flood, répétitions ou majuscules excessives.', inline: false },
      { name: '🚫 3. Contenu approprié', value: 'Pas de contenu NSFW, violent ou choquant hors des channels dédiés.', inline: false },
      { name: '📢 4. Pas de pub', value: 'Aucune publicité ou promotion sans autorisation du staff.', inline: false },
      { name: '💰 5. Pas d\'arnaque', value: 'Toute escroquerie ou fraude = ban immédiat et définitif.', inline: false },
      { name: '🎫 6. Tickets', value: 'Pour tout problème, utilisez `/ticket`. Ne contactez pas le staff en DM.', inline: false },
      { name: '⚖️ 7. Respect du staff', value: 'Les décisions du staff sont finales. Contestez via ticket, pas en public.', inline: false },
    ).setTimestamp().setFooter({ text: 'Le non-respect entraîne des sanctions.' })] });
  }

  // ── /cmd-ajouter ─────────────────────────────────────────
  if (commandName === 'cmd-ajouter') {
    const nom = interaction.options.getString('nom').toLowerCase().replace(/\s+/g, '-');
    const reponse = interaction.options.getString('reponse');
    db.customCmds[nom] = { reponse, auteur: interaction.user.username, date: new Date().toLocaleString('fr-FR') };
    return interaction.reply({ embeds: [successEmbed('Commande créée !', `La commande \`/cmd ${nom}\` est maintenant disponible.\n\n**Réponse :** ${reponse}`)] });
  }

  // ── /cmd-supprimer ───────────────────────────────────────
  if (commandName === 'cmd-supprimer') {
    const nom = interaction.options.getString('nom').toLowerCase();
    if (!db.customCmds[nom]) return interaction.reply({ embeds: [errorEmbed(`Commande \`${nom}\` introuvable.`)], ephemeral: true });
    delete db.customCmds[nom];
    return interaction.reply({ embeds: [successEmbed('Commande supprimée', `La commande \`${nom}\` a été supprimée.`)] });
  }

  // ── /cmd-liste ───────────────────────────────────────────
  if (commandName === 'cmd-liste') {
    const cmds = Object.entries(db.customCmds);
    if (!cmds.length) return interaction.reply({ embeds: [infoEmbed('Commandes personnalisées', 'Aucune commande personnalisée créée.\n\nUtilisez `/cmd-ajouter` pour en créer une.')] });
    const emb = new EmbedBuilder().setTitle('⚙️ Commandes personnalisées').setColor(C('#5865F2')).setDescription(cmds.map(([nom, data]) => `**\`/cmd ${nom}\`** — Par ${data.auteur}\n↳ ${data.reponse.substring(0, 60)}${data.reponse.length > 60 ? '...' : ''}`).join('\n\n')).setTimestamp();
    return interaction.reply({ embeds: [emb] });
  }

  // ── /cmd ─────────────────────────────────────────────────
  if (commandName === 'cmd') {
    const nom = interaction.options.getString('nom').toLowerCase();
    const cmd = db.customCmds[nom];
    if (!cmd) return interaction.reply({ embeds: [errorEmbed(`Commande \`${nom}\` introuvable. Utilisez \`/cmd-liste\` pour voir les commandes.`)], ephemeral: true });
    return interaction.reply({ content: cmd.reponse });
  }

  // ── /ticket ──────────────────────────────────────────────
  if (commandName === 'ticket') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const r = await createTicket(interaction.guild, interaction.user);
      if (r.already) return interaction.editReply({ content: `❌ Ticket existant : <#${r.channel.id}>` });
      return interaction.editReply({ content: `✅ Ton ticket : <#${r.channel.id}>` });
    } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
  }

  // ── /fermer ──────────────────────────────────────────────
  if (commandName === 'fermer') {
    if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ embeds: [errorEmbed('Cette commande ne fonctionne que dans un ticket.')], ephemeral: true });
    await interaction.reply({ content: '🔒 Fermeture dans 5 secondes...' });
    return closeTicket(interaction.channel, interaction.user);
  }

  // ── /add ─────────────────────────────────────────────────
  if (commandName === 'add') {
    const target = interaction.options.getMember('membre');
    await interaction.channel.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true });
    return interaction.reply({ embeds: [successEmbed('Membre ajouté', `${target} a accès à ce ticket.`)] });
  }

  // ── /points ──────────────────────────────────────────────
  if (commandName === 'points') {
    const target = interaction.options.getUser('membre') || interaction.user;
    const eco = getEconomy(target.id);
    const rank = Object.entries(db.economy).sort(([, a], [, b]) => b.points - a.points).findIndex(([id]) => id === target.id) + 1;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`💰 Points de ${target.username}`).setColor(C('#FAA61A')).setThumbnail(target.displayAvatarURL({ dynamic: true })).addFields({ name: '💰 Points', value: `**${eco.points}**`, inline: true }, { name: '🏆 Classement', value: `#${rank}`, inline: true }, { name: '📈 Total gagné', value: `${eco.totalEarned}`, inline: true }).setTimestamp()] });
  }

  // ── /daily ───────────────────────────────────────────────
  if (commandName === 'daily') {
    const eco = getEconomy(interaction.user.id);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    if (now - eco.lastDaily < cooldown) {
      const restant = Math.ceil((cooldown - (now - eco.lastDaily)) / 3600000);
      return interaction.reply({ embeds: [errorEmbed(`Tu as déjà récupéré ton daily ! Reviens dans **${restant}h**.`)], ephemeral: true });
    }
    const gain = Math.floor(Math.random() * 151) + 50; // 50-200
    eco.lastDaily = now;
    addPoints(interaction.user.id, gain);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎁 Daily Récupéré !').setDescription(`Tu as reçu **+${gain} points** !\n\nTotal : **${eco.points} points**`).setColor(C('#23D18B')).setTimestamp()] });
  }

  // ── /classement ──────────────────────────────────────────
  if (commandName === 'classement') {
    const top = Object.entries(db.economy).sort(([, a], [, b]) => b.points - a.points).slice(0, 10);
    if (!top.length) return interaction.reply({ embeds: [infoEmbed('Classement', 'Aucun membre dans le classement.')] });
    const medals = ['🥇', '🥈', '🥉'];
    const desc = top.map(([id, data], i) => `${medals[i] || `**${i + 1}.**`} <@${id}> — **${data.points} points**`).join('\n');
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Top 10 — Économie').setDescription(desc).setColor(C('#FAA61A')).setTimestamp()] });
  }

  // ── /donner-points ───────────────────────────────────────
  if (commandName === 'donner-points') {
    const target = interaction.options.getUser('membre');
    const montant = interaction.options.getInteger('montant');
    addPoints(target.id, montant);
    return interaction.reply({ embeds: [successEmbed('Points donnés', `**+${montant} points** donnés à <@${target.id}> !\nNouveau total : **${getEconomy(target.id).points} points**`)] });
  }

  // ── /giveaway ────────────────────────────────────────────
  if (commandName === 'giveaway') {
    const prix = interaction.options.getString('prix');
    const minutes = interaction.options.getInteger('minutes');
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const end = Date.now() + minutes * 60 * 1000;
    const endDate = new Date(end).toLocaleString('fr-FR');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway_join').setLabel('🎉 Participer').setStyle(ButtonStyle.Primary));
    const msg = await target.send({
      embeds: [new EmbedBuilder().setTitle('🎉 GIVEAWAY').setDescription(`**Prix :** ${prix}\n\n⏱️ **Fin :** ${endDate}\n🎟️ **Participants :** 0\n\nClique sur le bouton pour participer !`).setColor(C('#FAA61A')).setTimestamp(new Date(end)).setFooter({ text: `Organisé par ${interaction.user.username}` })],
      components: [row]
    });
    db.giveaways[msg.id] = { prize: prix, end, channel: target.id, entries: new Set(), ended: false };
    return interaction.reply({ embeds: [successEmbed('Giveaway créé !', `Giveaway pour **${prix}** dans ${target}. Fin dans ${minutes} minute(s).`)], ephemeral: true });
  }

  // ── /giveaway-terminer ───────────────────────────────────
  if (commandName === 'giveaway-terminer') {
    const msgId = interaction.options.getString('messageid');
    if (!db.giveaways[msgId]) return interaction.reply({ embeds: [errorEmbed('Giveaway introuvable.')], ephemeral: true });
    await endGiveaway(msgId, interaction.guild);
    return interaction.reply({ embeds: [successEmbed('Giveaway terminé', 'Le gagnant a été tiré au sort.')], ephemeral: true });
  }

  // ── /giveaway-reroll ─────────────────────────────────────
  if (commandName === 'giveaway-reroll') {
    const msgId = interaction.options.getString('messageid');
    const gw = db.giveaways[msgId];
    if (!gw) return interaction.reply({ embeds: [errorEmbed('Giveaway introuvable.')], ephemeral: true });
    const entries = [...gw.entries];
    if (!entries.length) return interaction.reply({ embeds: [errorEmbed('Aucun participant.')], ephemeral: true });
    const winner = entries[Math.floor(Math.random() * entries.length)];
    gw.winner = winner;
    addPoints(winner, 100);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Nouveau Gagnant !').setDescription(`**Prix :** ${gw.prize}\n**Nouveau gagnant :** <@${winner}>`).setColor(C('#23D18B')).setTimestamp()] });
    return;
  }

  // ── /sondage ─────────────────────────────────────────────
  if (commandName === 'sondage') {
    const question = interaction.options.getString('question');
    const optionsRaw = interaction.options.getString('options').split('|').map(s => s.trim()).filter(Boolean).slice(0, 9);
    if (optionsRaw.length < 2) return interaction.reply({ embeds: [errorEmbed('Minimum 2 options requises (séparées par |).')], ephemeral: true });
    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
    const emb = new EmbedBuilder().setTitle(`📊 ${question}`).setDescription(optionsRaw.map((opt, i) => `${emojis[i]} ${opt}`).join('\n')).setColor(C('#5865F2')).setTimestamp().setFooter({ text: `Sondage par ${interaction.user.username}` });
    const msg = await interaction.reply({ embeds: [emb], fetchReply: true });
    db.polls[msg.id] = { question, options: optionsRaw, votes: Object.fromEntries(optionsRaw.map((_, i) => [i, []])) };
    for (let i = 0; i < optionsRaw.length; i++) await msg.react(emojis[i]);
    return;
  }

  // ── /postuler ────────────────────────────────────────────
  if (commandName === 'postuler') {
    const modal = new ModalBuilder().setCustomId('application_modal').setTitle('📝 Candidature Staff');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q1').setLabel('Pourquoi veux-tu rejoindre l\'équipe ?').setStyle(TextInputStyle.Paragraph).setMinLength(50).setMaxLength(500).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q2').setLabel('Quelle est ton expérience dans la modération ?').setStyle(TextInputStyle.Paragraph).setMinLength(20).setMaxLength(300).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q3').setLabel('Quelle est ta disponibilité (heures/semaine) ?').setStyle(TextInputStyle.Short).setRequired(true))
    );
    return interaction.showModal(modal);
  }

  // ── /candidatures ────────────────────────────────────────
  if (commandName === 'candidatures') {
    const apps = db.applications;
    if (!apps.length) return interaction.reply({ embeds: [infoEmbed('Candidatures', 'Aucune candidature reçue.')], ephemeral: true });
    const emb = new EmbedBuilder().setTitle(`📋 Candidatures (${apps.length})`).setColor(C('#5865F2')).setDescription(
      apps.map((a, i) => `**${i + 1}.** ${a.username} — ${a.status} — ${a.date}`).join('\n')
    ).setTimestamp();
    return interaction.reply({ embeds: [emb], ephemeral: true });
  }

  // ── /donner-role ─────────────────────────────────────────
  if (commandName === 'donner-role') {
    const target = interaction.options.getMember('membre');
    const role = interaction.options.getRole('role');
    try { await target.roles.add(role); return interaction.reply({ embeds: [successEmbed('Rôle donné', `Rôle **${role.name}** donné à ${target}.`)], ephemeral: true }); }
    catch (e) { return interaction.reply({ embeds: [errorEmbed(e.message)], ephemeral: true }); }
  }

  // ── /retirer-role ────────────────────────────────────────
  if (commandName === 'retirer-role') {
    const target = interaction.options.getMember('membre');
    const role = interaction.options.getRole('role');
    try { await target.roles.remove(role); return interaction.reply({ embeds: [successEmbed('Rôle retiré', `Rôle **${role.name}** retiré de ${target}.`)], ephemeral: true }); }
    catch (e) { return interaction.reply({ embeds: [errorEmbed(e.message)], ephemeral: true }); }
  }
});

// Points pour messages
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot || !msg.guild) return;
  const eco = getEconomy(msg.author.id);
  if (!eco.lastMsg || Date.now() - eco.lastMsg > 60000) {
    eco.lastMsg = Date.now();
    addPoints(msg.author.id, 1);
  }

  // !setup-tickets
  if (msg.content === '!setup-tickets' && msg.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('🎫 Ouvrir un Ticket').setStyle(ButtonStyle.Primary));
    await msg.channel.send({ embeds: [new EmbedBuilder().setTitle('🎫 Centre de Support').setDescription('Cliquez sur le bouton pour ouvrir un ticket.\n\n📦 Commande\n🔧 Support\n❓ Question').setColor(C('#5865F2')).setTimestamp().setFooter({ text: 'NexusBot Support' })], components: [row] });
    msg.delete().catch(() => {});
  }
});

// ─── WEBHOOK SERVER ─────────────────────────────────────────
function startServer() {
  const app = express();
  app.use(express.json());
  app.get('/', (req, res) => res.json({ status: 'ok', bot: client.user?.tag, commands: COMMANDS.length, customCmds: Object.keys(db.customCmds).length }));

  app.post('/sellhub', async (req, res) => {
    res.status(200).json({ ok: true });
    const { event, data } = req.body || {};
    if ((event === 'order.created' || event === 'order.completed') && CH_SALES) {
      const guild = client.guilds.cache.get(GUILD_ID);
      const ch = guild?.channels.cache.get(CH_SALES);
      if (ch) {
        const order = data || {};
        ch.send({ embeds: [new EmbedBuilder().setTitle('💰 Nouvelle Vente !').setColor(C('#23D18B')).addFields({ name: '📦 Produit', value: order.product?.name || order.productName || '—', inline: true }, { name: '💵 Montant', value: order.amount ? parseFloat(order.amount).toFixed(2) + '€' : '—', inline: true }, { name: '📧 Client', value: order.email || '—', inline: true }).setTimestamp().setFooter({ text: 'Sellhub' })] });
      }
      if (data?.discordId && ROLE_VIP) {
        const guild = client.guilds.cache.get(GUILD_ID);
        const member = await guild?.members.fetch(data.discordId).catch(() => null);
        if (member) { const role = guild.roles.cache.get(ROLE_VIP); if (role) member.roles.add(role).catch(() => {}); }
      }
    }
  });

  app.listen(PORT, () => log(`🌐 Serveur webhook sur port ${PORT}`));
}

startServer();
client.login(TOKEN).catch(e => { console.error('❌ Login:', e.message); process.exit(1); });

