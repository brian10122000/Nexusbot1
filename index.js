// ═══════════════════════════════════════════════════════════════════
//  NexusBot PREMIUM + Panel Admin REST API
//  Nouvelles routes API :
//  GET  /api/status          — Statut du bot
//  GET  /api/cmds            — Liste des commandes custom
//  POST /api/cmds            — Créer/modifier une commande custom
//  DELETE /api/cmds/:name    — Supprimer une commande custom
//  GET  /api/articles        — Liste des articles
//  POST /api/articles        — Ajouter un article
//  DELETE /api/articles/:id  — Supprimer un article
//  PUT  /api/articles/:id    — Modifier un article
//  GET  /api/shop-config     — Config boutique
//  POST /api/shop-config     — Modifier config boutique
//  GET  /api/stats           — Stats du serveur Discord
//  POST /api/announce        — Envoyer une annonce
//  GET  /api/warns/:userId   — Warns d'un membre
//  POST /api/exec            — Exécuter une commande custom (code)
// ═══════════════════════════════════════════════════════════════════

const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, ChannelType, REST, Routes,
  SlashCommandBuilder, Events
} = require('discord.js');
const express = require('express');
const path    = require('path');
const crypto  = require('crypto');

// ─── CONFIG ─────────────────────────────────────────────────
const TOKEN          = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.CLIENT_ID;
const GUILD_ID       = process.env.GUILD_ID;
const SH_KEY         = process.env.SELLHUB_KEY   || '';
const STORE_URL      = process.env.STORE_URL      || '';
const PORT           = process.env.PORT           || 3000;
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'admin123';

const CH_WELCOME = process.env.CH_WELCOME || '';
const CH_BYE     = process.env.CH_BYE     || '';
const CH_SALES   = process.env.CH_SALES   || '';
const CH_LOGS    = process.env.CH_LOGS    || '';
const CH_TICKETS = process.env.CH_TICKETS || '';

const ROLE_MEMBER  = process.env.ROLE_MEMBER  || '';
const ROLE_VIP     = process.env.ROLE_VIP     || '';
const ROLE_SUPPORT = process.env.ROLE_SUPPORT || '';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ DISCORD_TOKEN, CLIENT_ID et GUILD_ID requis');
  process.exit(1);
}

// ─── BASE DE DONNÉES ────────────────────────────────────────
const db = {
  articles: [],
  economy: {},
  warns: {},
  ticketMap: {},
  giveaways: {},
  polls: {},
  // Les commandes custom sont maintenant dynamiques et réelles
  customCmds: {},
  applications: [],
  roleShop: [],
  reactionRoles: {},
  stockAlerts: {},
  shopConfig: {
    name: 'NexusStore',
    description: '',
    banner: '',
    thumb: '',
    color: '#f0b429',
    footer: 'Paiement 100% sécurisé 🔒',
    features: [
      '✅ **Livraison instantanée** — Reçois en quelques secondes',
      '🔒 **100% Sécurisé** — Paiements protégés & anonymes',
      '🛠️ **Produits vérifiés** — Tout est testé & garanti',
      '💸 **Remboursement assuré** — Zéro risque, zéro perte',
      '⚡ **Ultra rapide** — Pas d\'attente, pas de blabla',
    ]
  },
  boutiqueConfig: {
    lien:          process.env.STORE_URL       || '',
    nom:           process.env.STORE_NAME      || 'NexusStore',
    emailContact:  process.env.EMAIL_CONTACT   || '',
    emailPaiement: process.env.EMAIL_PAIEMENT  || '',
    stripeLien:    process.env.STRIPE_LIEN     || '',
    sumupLien:     process.env.SUMUP_LIEN      || '',
  },
  sellhubProducts: [],
  // Logs panel
  panelLogs: [],
};

// ─── TEMPLATES ──────────────────────────────────────────────
const RULES_TEMPLATES = {
  vente: [
    { e: '🤝', t: 'Respect mutuel', d: 'Traitez chaque membre avec respect. Aucune insulte, moquerie ou comportement toxique ne sera toléré.' },
    { e: '💰', t: 'Transactions honnêtes', d: 'Toute vente doit être transparente. Les descriptions de produits doivent être exactes et complètes.' },
    { e: '🚫', t: 'Zéro escroquerie', d: 'Toute tentative de fraude entraîne un bannissement définitif et immédiat.' },
    { e: '📦', t: 'Livraison & Support', d: 'Tout vendeur s\'engage à livrer dans les délais annoncés. En cas de problème, ouvrez un ticket.' },
    { e: '🔒', t: 'Confidentialité', d: 'Ne partagez jamais vos données personnelles dans les salons publics.' },
    { e: '📢', t: 'Publicité interdite', d: 'Aucune promotion externe sans permission écrite du staff.' },
    { e: '🎫', t: 'Utilisation des tickets', d: 'Pour tout litige, utilisez la commande /ticket.' },
    { e: '🌍', t: 'Langue française', d: 'Les salons généraux sont en français.' },
    { e: '⚖️', t: 'Décisions du staff', d: 'Les décisions du staff sont définitives.' },
    { e: '🔞', t: 'Âge minimum', d: 'L\'accès à certains produits est réservé aux membres majeurs.' },
  ],
  gaming: [
    { e: '🎮', t: 'Fair-play obligatoire', d: 'Le triche et le comportement toxique sont interdits.' },
    { e: '🤝', t: 'Respect & bienveillance', d: 'Aucune insulte ou harassment.' },
    { e: '📢', t: 'Pas de spam', d: 'Pas de flood ou de mentions abusives.' },
    { e: '🚫', t: 'Contenu approprié', d: 'Pas de contenu NSFW hors des salons dédiés.' },
    { e: '🎤', t: 'Vocaux', d: 'Micro propre recommandé, pas de bruit excessif.' },
    { e: '🏆', t: 'Compétitions', d: 'Lors des tournois, les décisions des arbitres sont finales.' },
    { e: '📱', t: 'Self-promo', d: 'Streams/vidéos uniquement dans le salon dédié.' },
    { e: '🔒', t: 'Comptes personnels', d: 'Ne partagez jamais vos identifiants de jeux.' },
    { e: '⚖️', t: 'Sanctions', d: 'Warn → Mute → Kick → Ban.' },
    { e: '🎫', t: 'Support', d: 'Pour tout problème, ouvrez un ticket avec /ticket.' },
  ],
  communaute: [
    { e: '💙', t: 'Bienveillance', d: 'Soutenez-vous mutuellement et restez respectueux.' },
    { e: '🗣️', t: 'Communication saine', d: 'Les désaccords sont normaux, les conflits personnels non.' },
    { e: '🚫', t: 'Discrimination zéro', d: 'Aucune discrimination sous aucune forme.' },
    { e: '📵', t: 'Anti-spam', d: 'Un message à la fois, pas de flood.' },
    { e: '🔞', t: 'Contenu adapté', d: 'Respectez les restrictions d\'âge des salons.' },
    { e: '🔒', t: 'Vie privée', d: 'Ne partagez pas d\'informations personnelles.' },
    { e: '📢', t: 'Publicité', d: 'Toute promotion doit être approuvée.' },
    { e: '🎫', t: 'Signalements', d: 'Utilisez /ticket pour signaler une infraction.' },
    { e: '🏅', t: 'Rôles & grades', d: 'Les rôles sont gagnés par l\'activité.' },
    { e: '⚖️', t: 'Modération', d: 'Les modérateurs ont le dernier mot.' },
  ],
};

const WELCOME_TEMPLATES = [
  '👋 Bienvenue **{user}** sur **{server}** !\n\nNous sommes maintenant **{count}** membres 🎉\n\n📜 Lis les règles avec `/regles`\n🛒 Découvre notre boutique avec `/shop`',
];

const DESC_TEMPLATES = {
  digital: ['🔑 **Accès lifetime** inclus\n✅ Livraison instantanée\n🔄 Mises à jour gratuites\n💬 Support dédié'],
  service: ['🛠️ **Service professionnel** clé en main\n✅ Satisfaction garantie ou remboursé'],
};

// ─── HELPERS ────────────────────────────────────────────────
const C   = h => parseInt((h || '#5865F2').replace('#', ''), 16);
const log = m => {
  const entry = { time: new Date().toLocaleTimeString('fr-FR'), msg: m };
  console.log(`[${entry.time}] ${m}`);
  db.panelLogs.unshift(entry);
  if (db.panelLogs.length > 200) db.panelLogs.pop();
};

function getUser(id) {
  if (!db.economy[id]) db.economy[id] = { points: 0, xp: 0, level: 1, lastDaily: 0, lastMsg: 0, totalEarned: 0, messages: 0 };
  return db.economy[id];
}
function addXP(id, amount) {
  const u = getUser(id); u.xp += amount; u.messages++;
  const needed = u.level * 100;
  if (u.xp >= needed) { u.xp -= needed; u.level++; return true; }
  return false;
}
function addPts(id, n) { const u = getUser(id); u.points += n; u.totalEarned += n; return u.points; }
function rank(id) { return Object.entries(db.economy).sort(([,a],[,b]) => b.points - a.points).findIndex(([i]) => i === id) + 1; }

const OK  = (t, d) => new EmbedBuilder().setTitle(`✅ ${t}`).setDescription(d).setColor(C('#10d982')).setTimestamp();
const ERR = d      => new EmbedBuilder().setTitle('❌ Erreur').setDescription(d).setColor(C('#ff4d4d')).setTimestamp();
const INF = (t, d) => new EmbedBuilder().setTitle(`ℹ️ ${t}`).setDescription(d).setColor(C('#4d8fff')).setTimestamp();

function articleEmbed(a, showBuy = true) {
  const emb = new EmbedBuilder()
    .setTitle(`${a.emoji || '🛒'} ${a.name}`)
    .setColor(C(a.color || '#f0b429'))
    .setTimestamp()
    .setFooter({ text: `${db.shopConfig.name} • Paiement sécurisé 🔒` });
  if (a.description) emb.setDescription(a.description);
  const fields = [{ name: '💰 Prix', value: `**${a.price}**`, inline: true }];
  if (a.stock !== undefined && a.stock !== null) fields.push({ name: '📦 Stock', value: a.stock === 0 ? '❌ Rupture' : a.stock === -1 ? '♾️ Illimité' : `✅ ${a.stock}`, inline: true });
  if (a.category) fields.push({ name: '🏷️ Catégorie', value: a.category, inline: true });
  if (showBuy && a.link) fields.push({ name: '🔗 Acheter', value: `[**→ Payer maintenant**](${a.link})`, inline: false });
  emb.addFields(fields);
  if (a.image) emb.setImage(a.image);
  return emb;
}

function buildShopEmbed() {
  const cfg = db.shopConfig;
  const articles = db.articles.filter(a => a.visible !== false && (a.stock === undefined || a.stock !== 0));
  const emb = new EmbedBuilder()
    .setTitle(cfg.name || '🛒 Boutique')
    .setColor(C(cfg.color || '#f0b429'))
    .setTimestamp()
    .setFooter({ text: cfg.footer || 'Paiement sécurisé 🔒' });
  if (cfg.description) emb.setDescription(cfg.description);
  else if (cfg.features?.length) emb.setDescription(cfg.features.join('\n'));
  if (cfg.banner) emb.setImage(cfg.banner);
  articles.forEach(a => {
    const stock = a.stock === -1 ? '♾️' : a.stock === 0 ? '❌' : a.stock != null ? `✅ ${a.stock}` : '✅';
    const val = `${stock} — **${a.price}**${a.link ? `\n[**→ Acheter**](${a.link})` : ''}`;
    emb.addFields({ name: `${a.emoji || '🛒'} ${a.name}`, value: val, inline: true });
  });
  if (STORE_URL) emb.addFields({ name: '\u200b', value: `[🌐 **Voir toute la boutique**](${STORE_URL})`, inline: false });
  return emb;
}

// ─── EXÉCUTEUR DE CODE CUSTOM ────────────────────────────────
// Exécute le code JS d'une commande custom de façon sécurisée
async function runCustomCode(code, interaction) {
  try {
    // On crée une fonction async avec accès aux objets Discord.js nécessaires
    const fn = new Function(
      'interaction', 'guild', 'user', 'db', 'EmbedBuilder', 'ActionRowBuilder',
      'ButtonBuilder', 'ButtonStyle', 'addPts', 'addXP', 'getUser', 'C',
      `return (async () => { ${code} })()`
    );
    await fn(
      interaction,
      interaction.guild,
      interaction.user,
      db,
      EmbedBuilder,
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
      addPts,
      addXP,
      getUser,
      C
    );
    return { ok: true };
  } catch (e) {
    log(`❌ Erreur code custom: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// ─── TICKETS ────────────────────────────────────────────────
async function openTicket(guild, user, category = 'Général') {
  if (db.ticketMap[user.id]) {
    const ex = guild.channels.cache.get(db.ticketMap[user.id]);
    if (ex) return { already: true, channel: ex };
  }
  const num  = Math.floor(Math.random() * 9000) + 1000;
  const name = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g,'')}-${num}`;
  const perms = [
    { id: guild.id, deny:  [PermissionFlagsBits.ViewChannel] },
    { id: user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (ROLE_SUPPORT) perms.push({ id: ROLE_SUPPORT, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  const opts = { name, type: ChannelType.GuildText, topic: `${category} • ${user.username} (${user.id})`, permissionOverwrites: perms };
  if (CH_TICKETS) { const cat = guild.channels.cache.get(CH_TICKETS); if (cat) opts.parent = CH_TICKETS; }
  const channel = await guild.channels.create(opts);
  db.ticketMap[user.id] = channel.id;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('t_close').setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('t_claim').setLabel('✋ Prendre en charge').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('t_transcript').setLabel('📄 Transcript').setStyle(ButtonStyle.Secondary)
  );
  await channel.send({
    content: `${user}${ROLE_SUPPORT ? ` <@&${ROLE_SUPPORT}>` : ''}`,
    embeds: [new EmbedBuilder().setTitle(`🎫 Ticket #${num} — ${category}`).setDescription(`Bienvenue ${user} ! Décrivez votre demande.\nNotre équipe vous répond rapidement.`).setColor(C('#5865F2')).addFields({ name: '📋 Catégorie', value: category, inline: true },{ name: '⏱️ Temps de réponse', value: '< 24h', inline: true }).setTimestamp()],
    components: [row]
  });
  addPts(user.id, 5);
  return { channel, num };
}

async function closeTicket(channel, closer) {
  const uid = Object.entries(db.ticketMap).find(([,cid]) => cid === channel.id)?.[0];
  if (uid) delete db.ticketMap[uid];
  await channel.send({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Fermé').setDescription(`Fermé par ${closer}. Suppression dans 5s.`).setColor(C('#ff4d4d')).setTimestamp()] });
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

async function endGiveaway(msgId, guild) {
  const gw = db.giveaways[msgId];
  if (!gw || gw.ended) return;
  gw.ended = true;
  const ch = guild.channels.cache.get(gw.channel);
  const entries = [...gw.entries];
  if (!ch) return;
  if (!entries.length) return ch.send({ embeds: [ERR(`Giveaway **${gw.prize}** terminé — aucun participant.`)] });
  const winner = entries[Math.floor(Math.random() * entries.length)];
  gw.winner = winner;
  addPts(winner, 100);
  ch.send({ content: `🎉 <@${winner}>`, embeds: [new EmbedBuilder().setTitle('🎉 Giveaway Terminé !').setColor(C('#10d982')).addFields({ name: '🏆 Prix', value: gw.prize, inline: true },{ name: '🎊 Gagnant', value: `<@${winner}>`, inline: true },{ name: '👥 Participants', value: `${entries.length}`, inline: true }).setTimestamp()] });
}

// ─── SLASH COMMANDS STATIQUES ────────────────────────────────
const STATIC_COMMANDS = [
  new SlashCommandBuilder().setName('ping').setDescription('🏓 Latence du bot'),
  new SlashCommandBuilder().setName('aide').setDescription('📋 Toutes les commandes'),
  new SlashCommandBuilder().setName('info').setDescription('ℹ️ Informations sur le serveur'),
  new SlashCommandBuilder().setName('profil').setDescription('👤 Voir un profil').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Avatar d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('stats').setDescription('📊 Statistiques du serveur'),
  new SlashCommandBuilder().setName('rapport').setDescription('📑 Rapport complet').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('ajouter-article').setDescription('🛒 Ajouter un article').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true))
    .addStringOption(o=>o.setName('prix').setDescription('Prix').setRequired(true))
    .addStringOption(o=>o.setName('lien').setDescription('Lien de paiement').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Description'))
    .addStringOption(o=>o.setName('emoji').setDescription('Emoji'))
    .addStringOption(o=>o.setName('categorie').setDescription('Catégorie'))
    .addIntegerOption(o=>o.setName('stock').setDescription('Stock (-1=illimité)'))
    .addStringOption(o=>o.setName('image').setDescription('URL image')),
  new SlashCommandBuilder().setName('supprimer-article').setDescription('🗑️ Supprimer un article').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)),
  new SlashCommandBuilder().setName('modifier-article').setDescription('✏️ Modifier un article').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom actuel').setRequired(true))
    .addStringOption(o=>o.setName('prix').setDescription('Nouveau prix'))
    .addIntegerOption(o=>o.setName('stock').setDescription('Nouveau stock'))
    .addStringOption(o=>o.setName('description').setDescription('Nouvelle description')),
  new SlashCommandBuilder().setName('liste-articles').setDescription('📋 Liste des articles'),
  new SlashCommandBuilder().setName('shop').setDescription('🛒 Affiche la boutique'),
  new SlashCommandBuilder().setName('article').setDescription('🛒 Détails d\'un article').addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)),
  new SlashCommandBuilder().setName('publier-shop').setDescription('📤 Publie la boutique').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Channel cible'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone ou @here')),
  new SlashCommandBuilder().setName('publier-article').setDescription('📤 Publie un article').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel cible')),
  new SlashCommandBuilder().setName('config-shop').setDescription('⚙️ Configure la boutique').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex'))
    .addStringOption(o=>o.setName('banner').setDescription('URL bannière'))
    .addStringOption(o=>o.setName('footer').setDescription('Texte du footer')),
  new SlashCommandBuilder().setName('generer-regles').setDescription('📜 Génère des règles').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({ name: '🛒 Vente', value: 'vente' },{ name: '🎮 Gaming', value: 'gaming' },{ name: '💬 Communauté', value: 'communaute' }))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel cible')),
  new SlashCommandBuilder().setName('generer-bienvenue').setDescription('👋 Message de bienvenue').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setup-salon').setDescription('⚙️ Crée un salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices(
      { name: '🛒 Boutique', value: 'shop' },{ name: '📜 Règles', value: 'rules' },
      { name: '👋 Bienvenue', value: 'welcome' },{ name: '🎫 Tickets', value: 'tickets' },
      { name: '📢 Annonces', value: 'annonces' },{ name: '💬 Général', value: 'general' }
    )),
  new SlashCommandBuilder().setName('setup-serveur').setDescription('🚀 Configure le serveur').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({ name: '🛒 Vente', value: 'vente' },{ name: '🎮 Gaming', value: 'gaming' },{ name: '💬 Communauté', value: 'communaute' })),
  new SlashCommandBuilder().setName('annonce').setDescription('📢 Annonce embed').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o=>o.setName('message').setDescription('Contenu').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone / @here'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex'))
    .addStringOption(o=>o.setName('image').setDescription('URL image')),
  new SlashCommandBuilder().setName('message-perso').setDescription('💬 Message simple').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('contenu').setDescription('Contenu').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('bouton').setDescription('🔘 Bouton lien').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('texte').setDescription('Texte').setRequired(true))
    .addStringOption(o=>o.setName('lien').setDescription('URL').setRequired(true))
    .addStringOption(o=>o.setName('message').setDescription('Message au-dessus')),
  new SlashCommandBuilder().setName('boutons').setDescription('🔘 Embed avec boutons').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o=>o.setName('btn1').setDescription('Bouton 1 : texte|lien').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Description'))
    .addStringOption(o=>o.setName('btn2').setDescription('Bouton 2'))
    .addStringOption(o=>o.setName('btn3').setDescription('Bouton 3'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur'))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone ou @here')),
  new SlashCommandBuilder().setName('ma-boutique').setDescription('🛒 Boutique complète').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Channel'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone ou @here')),
  new SlashCommandBuilder().setName('contact').setDescription('📧 Informations de contact'),
  new SlashCommandBuilder().setName('paiements').setDescription('💳 Moyens de paiement'),
  new SlashCommandBuilder().setName('config-boutique').setDescription('⚙️ Configure la boutique').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('lien').setDescription('Lien boutique'))
    .addStringOption(o=>o.setName('email_contact').setDescription('Email contact'))
    .addStringOption(o=>o.setName('stripe_lien').setDescription('Lien Stripe'))
    .addStringOption(o=>o.setName('sumup_lien').setDescription('Lien Sumup'))
    .addStringOption(o=>o.setName('nom').setDescription('Nom boutique')),
  new SlashCommandBuilder().setName('epingler').setDescription('📌 Épingle un message').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o=>o.setName('messageid').setDescription('ID').setRequired(true)),
  new SlashCommandBuilder().setName('regles').setDescription('📜 Affiche les règles'),
  new SlashCommandBuilder().setName('warn').setDescription('⚠️ Avertir').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)),
  new SlashCommandBuilder().setName('warns').setDescription('📋 Voir les warns').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('clearwarns').setDescription('🗑️ Effacer les warns').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('👢 Expulser').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o=>o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('ban').setDescription('🔨 Bannir').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o=>o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('unban').setDescription('🔓 Débannir').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o=>o.setName('userid').setDescription('ID').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('🔇 Sourdine').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Minutes').setMinValue(1).setMaxValue(40320))
    .addStringOption(o=>o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('unmute').setDescription('🔊 Enlever sourdine').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('🗑️ Supprimer messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName('nombre').setDescription('Nombre').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('lock').setDescription('🔒 Verrouiller').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('🔓 Déverrouiller').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('slowmode').setDescription('🐌 Slow mode').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(o=>o.setName('secondes').setDescription('Secondes').setRequired(true).setMinValue(0).setMaxValue(21600)),
  new SlashCommandBuilder().setName('sanctions').setDescription('📋 Historique sanctions').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('ticket').setDescription('🎫 Ouvrir un ticket'),
  new SlashCommandBuilder().setName('fermer').setDescription('🔒 Fermer le ticket'),
  new SlashCommandBuilder().setName('add').setDescription('➕ Ajouter au ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('retirer').setDescription('➖ Retirer du ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('renommer-ticket').setDescription('✏️ Renommer le ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o=>o.setName('nom').setDescription('Nouveau nom').setRequired(true)),
  new SlashCommandBuilder().setName('points').setDescription('💰 Voir vos points').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('niveau').setDescription('⭐ Voir votre niveau').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('daily').setDescription('🎁 Points quotidiens'),
  new SlashCommandBuilder().setName('classement').setDescription('🏆 Top 10 membres'),
  new SlashCommandBuilder().setName('classement-xp').setDescription('⭐ Top 10 XP'),
  new SlashCommandBuilder().setName('donner-points').setDescription('💸 Donner des points').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('shop-roles').setDescription('🛍️ Boutique de rôles'),
  new SlashCommandBuilder().setName('acheter-role').setDescription('🛍️ Acheter un rôle')
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('ajouter-role-shop').setDescription('🛍️ Ajouter rôle en vente').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true))
    .addIntegerOption(o=>o.setName('prix').setDescription('Prix').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Créer un giveaway').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('prix').setDescription('Prix').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Durée').setRequired(true).setMinValue(1))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('giveaway-fin').setDescription('🏁 Terminer un giveaway').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),
  new SlashCommandBuilder().setName('giveaway-reroll').setDescription('🔄 Nouveau gagnant').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),
  new SlashCommandBuilder().setName('sondage').setDescription('📊 Créer un sondage').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('question').setDescription('Question').setRequired(true))
    .addStringOption(o=>o.setName('options').setDescription('Options séparées par |').setRequired(true)),
  new SlashCommandBuilder().setName('resultats').setDescription('📊 Résultats sondage')
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),
  new SlashCommandBuilder().setName('cmd').setDescription('▶️ Commande personnalisée')
    .addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)),
  new SlashCommandBuilder().setName('cmd-liste').setDescription('📋 Toutes vos commandes custom'),
  new SlashCommandBuilder().setName('donner-role').setDescription('🎭 Donner un rôle').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('retirer-role').setDescription('🎭 Retirer un rôle').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('reaction-role').setDescription('🎭 Reaction roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o=>o.setName('paires').setDescription('emoji:roleID séparés par |').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('postuler').setDescription('📝 Postuler dans l\'équipe'),
  new SlashCommandBuilder().setName('candidatures').setDescription('📋 Voir les candidatures').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(c => c.toJSON());

// ─── CLIENT ─────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction],
});

async function register() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: STATIC_COMMANDS });
    log(`✅ ${STATIC_COMMANDS.length} commandes statiques enregistrées`);
  } catch (e) { log(`❌ Register: ${e.message}`); }
}

client.once(Events.ClientReady, async () => {
  log(`✅ ${client.user.tag} connecté`);
  client.user.setActivity(`🛒 /shop | /aide | Panel Admin`, { type: 3 });
  await register();
  if (SH_KEY) {
    try {
      const r = await fetch('https://dash.sellhub.cx/api/sellhub/products', { headers: { Authorization: SH_KEY } });
      const d = await r.json();
      db.sellhubProducts = d.data || d.products || (Array.isArray(d) ? d : []);
      log(`🛒 ${db.sellhubProducts.length} produits Sellhub`);
    } catch (e) { log(`⚠️ Sellhub: ${e.message}`); }
  }
  setInterval(() => {
    Object.entries(db.giveaways).forEach(([id, gw]) => {
      if (!gw.ended && gw.end <= Date.now()) {
        const g = client.guilds.cache.get(GUILD_ID);
        if (g) endGiveaway(id, g);
      }
    });
  }, 10000);
});

client.on(Events.GuildMemberAdd, async member => {
  addPts(member.id, 10);
  if (ROLE_MEMBER) { const r = member.guild.roles.cache.get(ROLE_MEMBER); if (r) member.roles.add(r).catch(() => {}); }
  if (!CH_WELCOME) return;
  const ch = member.guild.channels.cache.get(CH_WELCOME);
  if (!ch) return;
  const tmpl = WELCOME_TEMPLATES[0]
    .replace('{user}', member.toString())
    .replace('{server}', member.guild.name)
    .replace('{count}', member.guild.memberCount.toString());
  ch.send({ embeds: [new EmbedBuilder().setTitle(`👋 Bienvenue sur ${member.guild.name} !`).setDescription(tmpl).setColor(C('#5865F2')).setThumbnail(member.user.displayAvatarURL({ dynamic: true })).setTimestamp()] });
});

client.on(Events.GuildMemberRemove, async member => {
  if (!CH_BYE) return;
  const ch = member.guild.channels.cache.get(CH_BYE);
  if (ch) ch.send({ embeds: [new EmbedBuilder().setDescription(`👋 **${member.user.username}** a quitté le serveur. Il reste **${member.guild.memberCount}** membres.`).setColor(C('#ff4d4d')).setTimestamp()] });
});

client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot || !msg.guild) return;
  const u = getUser(msg.author.id);
  if (Date.now() - u.lastMsg > 60000) {
    u.lastMsg = Date.now();
    const levelUp = addXP(msg.author.id, Math.floor(Math.random() * 5) + 1);
    addPts(msg.author.id, 1);
    if (levelUp) {
      msg.channel.send({ embeds: [new EmbedBuilder().setTitle('⭐ Level Up !').setDescription(`Félicitations ${msg.author} ! Tu passes au **niveau ${u.level}** ! 🎉`).setColor(C('#f0b429')).setTimestamp()] }).catch(() => {});
      addPts(msg.author.id, u.level * 10);
    }
  }
  if (msg.content === '!setup-tickets' && msg.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('t_open_cmd').setLabel('📦 Commande').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('t_open_sup').setLabel('🔧 Support').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('t_open_q').setLabel('❓ Question').setStyle(ButtonStyle.Success)
    );
    msg.channel.send({ embeds: [new EmbedBuilder().setTitle('🎫 Centre de Support').setDescription('Choisissez la catégorie :').setColor(C('#5865F2')).setTimestamp()], components: [row] });
    msg.delete().catch(() => {});
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const msgId = reaction.message.id;
  if (db.giveaways[msgId]?.entries) db.giveaways[msgId].entries.add(user.id);
  const rr = db.reactionRoles[msgId];
  if (rr) {
    const roleId = rr[reaction.emoji.name] || rr[reaction.emoji.toString()];
    if (roleId) {
      const m = await reaction.message.guild?.members.fetch(user.id).catch(() => null);
      const r = reaction.message.guild?.roles.cache.get(roleId);
      if (m && r) m.roles.add(r).catch(() => {});
    }
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const msgId = reaction.message.id;
  if (db.giveaways[msgId]?.entries) db.giveaways[msgId].entries.delete(user.id);
  const rr = db.reactionRoles[msgId];
  if (rr) {
    const roleId = rr[reaction.emoji.name] || rr[reaction.emoji.toString()];
    if (roleId) {
      const m = await reaction.message.guild?.members.fetch(user.id).catch(() => null);
      const r = reaction.message.guild?.roles.cache.get(roleId);
      if (m && r) m.roles.remove(r).catch(() => {});
    }
  }
});

// ─── INTERACTIONS ────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {

  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id.startsWith('t_open_')) {
      const cat = id === 't_open_cmd' ? 'Commande' : id === 't_open_sup' ? 'Support' : 'Question';
      await interaction.deferReply({ ephemeral: true });
      try {
        const r = await openTicket(interaction.guild, interaction.user, cat);
        if (r.already) return interaction.editReply({ content: `❌ Ticket existant : <#${r.channel.id}>` });
        return interaction.editReply({ content: `✅ Ticket créé : <#${r.channel.id}>` });
      } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
    }
    if (id === 't_close') {
      if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ content: '❌', ephemeral: true });
      await interaction.reply({ content: '🔒 Fermeture dans 5 secondes...' });
      return closeTicket(interaction.channel, interaction.user);
    }
    if (id === 't_claim') return interaction.reply({ content: `✋ **${interaction.user.username}** prend en charge ce ticket.` });
    if (id === 't_transcript') {
      await interaction.deferReply({ ephemeral: true });
      const msgs = await interaction.channel.messages.fetch({ limit: 100 });
      const txt  = [...msgs.values()].reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleString('fr-FR')}] ${m.author.username}: ${m.content || '[embed]'}`).join('\n');
      return interaction.editReply({ files: [{ attachment: Buffer.from(txt, 'utf-8'), name: `transcript-${interaction.channel.name}.txt` }] });
    }
    if (id === 'gw_join') {
      const gw = db.giveaways[interaction.message.id];
      if (!gw || gw.ended) return interaction.reply({ content: '❌ Giveaway terminé.', ephemeral: true });
      if (gw.entries.has(interaction.user.id)) { gw.entries.delete(interaction.user.id); return interaction.reply({ content: `😔 Retiré. Participants : **${gw.entries.size}**`, ephemeral: true }); }
      gw.entries.add(interaction.user.id);
      return interaction.reply({ content: `🎉 Tu participes ! Participants : **${gw.entries.size}**`, ephemeral: true });
    }
    if (id.startsWith('app_ok_') || id.startsWith('app_no_')) {
      const idx = parseInt(id.split('_')[2]);
      const app = db.applications[idx];
      if (!app) return interaction.reply({ content: '❌', ephemeral: true });
      const ok = id.startsWith('app_ok_');
      app.status = ok ? 'acceptée' : 'refusée';
      const u = await client.users.fetch(app.userId).catch(() => null);
      if (u) u.send({ embeds: [new EmbedBuilder().setTitle(ok ? '✅ Candidature Acceptée !' : '❌ Candidature Refusée').setDescription(ok ? `Félicitations ! Bienvenue dans l'équipe de **${interaction.guild.name}** !` : `Ta candidature sur **${interaction.guild.name}** n'a pas été retenue.`).setColor(C(ok ? '#10d982' : '#ff4d4d')).setTimestamp()] }).catch(() => {});
      await interaction.update({ components: [] });
      return interaction.followUp({ content: `${ok ? '✅ Accepté' : '❌ Refusé'} : **${app.username}**`, ephemeral: true });
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'app_modal') {
    const answers = ['app_q1','app_q2','app_q3'].map(q => interaction.fields.getTextInputValue(q));
    const app = { userId: interaction.user.id, username: interaction.user.username, answers, date: new Date().toLocaleString('fr-FR'), status: 'en attente' };
    db.applications.push(app);
    const idx = db.applications.length - 1;
    await interaction.reply({ embeds: [OK('Candidature envoyée !', 'Ta candidature a été reçue.')], ephemeral: true });
    if (CH_LOGS) {
      const ch = interaction.guild.channels.cache.get(CH_LOGS);
      if (ch) ch.send({
        embeds: [new EmbedBuilder().setTitle('📝 Nouvelle Candidature').setColor(C('#f0b429')).addFields({ name: '👤 Candidat', value: `${interaction.user}` },{ name: '❓ Motivation', value: answers[0] }).setTimestamp()],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`app_ok_${idx}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`app_no_${idx}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger))]
      });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  // ══ /cmd — COMMANDES CUSTOM DU PANEL ══════════════════════
  // C'est ici que les commandes créées dans le panel sont exécutées
  if (cmd === 'cmd') {
    const nom = interaction.options.getString('nom').toLowerCase().replace(/\s+/g, '-');
    const c   = db.customCmds[nom];
    if (!c) return interaction.reply({ embeds: [ERR(`Commande \`${nom}\` introuvable. Voir \`/cmd-liste\`.`)], ephemeral: true });

    // Si la commande a du code personnalisé → on l'exécute
    if (c.code && c.code.trim()) {
      await interaction.deferReply({ ephemeral: c.ephemeral || false });
      const result = await runCustomCode(c.code, interaction);
      if (!result.ok) {
        return interaction.editReply({ embeds: [ERR(`Erreur d'exécution : \`${result.error}\``)] });
      }
      // Le code a géré lui-même la réponse
      return;
    }

    // Sinon → réponse texte simple
    if (!c.reponse) return interaction.reply({ embeds: [ERR('Cette commande n\'a pas de réponse définie.')], ephemeral: true });

    const text = c.reponse
      .replace('{user}',   interaction.user.toString())
      .replace('{server}', interaction.guild.name)
      .replace('{count}',  interaction.guild.memberCount.toString())
      .replace('{points}', getUser(interaction.user.id).points.toString());

    if (c.type === 'embed') {
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(text).setColor(C(c.color || '#f0b429')).setTimestamp()] });
    }
    return interaction.reply({ content: text });
  }

  if (cmd === 'cmd-liste') {
    const cmds = Object.entries(db.customCmds);
    if (!cmds.length) return interaction.reply({ embeds: [INF('Commandes perso', 'Aucune. Créez-en depuis le panel admin.')], ephemeral: true });
    const emb = new EmbedBuilder().setTitle(`⚡ Commandes personnalisées (${cmds.length})`).setColor(C('#f0b429')).setTimestamp();
    cmds.forEach(([n, c]) => emb.addFields({ name: `/cmd ${n}`, value: c.desc || c.reponse?.substring(0, 80) || 'Code custom', inline: false }));
    return interaction.reply({ embeds: [emb] });
  }

  // ══ COMMANDES STATIQUES ══════════════════════════════════

  if (cmd === 'ping') {
    const l = Date.now() - interaction.createdTimestamp;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏓 Pong !').setColor(C('#10d982')).addFields({ name: '⚡ Latence', value: `\`${l}ms\``, inline: true },{ name: '💓 API', value: `\`${Math.round(client.ws.ping)}ms\``, inline: true },{ name: '⏱️ Uptime', value: `\`${Math.floor(client.uptime/3600000)}h ${Math.floor((client.uptime%3600000)/60000)}m\``, inline: true }).setTimestamp()] });
  }

  if (cmd === 'aide') {
    const customList = Object.keys(db.customCmds).map(n => `\`/cmd ${n}\``).join(' ') || 'Aucune (créez-en depuis le panel admin)';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📋 NexusBot Premium').setColor(C('#f0b429')).addFields(
      { name: '🛒 Boutique', value: '`/shop` `/article` `/liste-articles` `/publier-shop`' },
      { name: '🛡️ Modération', value: '`/warn` `/kick` `/ban` `/mute` `/clear` `/lock`' },
      { name: '🎫 Tickets', value: '`/ticket` `/fermer` `/add` `/retirer`' },
      { name: '💰 Économie', value: '`/points` `/niveau` `/daily` `/classement`' },
      { name: '🎉 Events', value: '`/giveaway` `/sondage` `/reaction-role`' },
      { name: '⚡ Commandes custom', value: customList },
      { name: '🌐 Panel Admin', value: 'Accédez au panel pour créer des commandes custom !' },
    ).setFooter({ text: '100% gratuit • Panel Admin intégré' }).setTimestamp()] });
  }

  if (cmd === 'info') {
    const g = interaction.guild; await g.fetch();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏠 ${g.name}`).setThumbnail(g.iconURL({ dynamic: true })).setColor(C('#5865F2')).addFields({ name: '👥 Membres', value: `${g.memberCount}`, inline: true },{ name: '📅 Créé le', value: g.createdAt.toLocaleDateString('fr-FR'), inline: true },{ name: '🎭 Rôles', value: `${g.roles.cache.size}`, inline: true },{ name: '# Channels', value: `${g.channels.cache.size}`, inline: true },{ name: '⚡ Cmds custom', value: `${Object.keys(db.customCmds).length}`, inline: true }).setTimestamp()] });
  }

  if (cmd === 'stats') {
    const g = interaction.guild;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📊 Stats — ${g.name}`).setColor(C('#f0b429')).addFields(
      { name: '👤 Humains',    value: `${g.members.cache.filter(m=>!m.user.bot).size}`, inline: true },
      { name: '🤖 Bots',       value: `${g.members.cache.filter(m=>m.user.bot).size}`, inline: true },
      { name: '💬 Channels',   value: `${g.channels.cache.filter(c=>c.type===ChannelType.GuildText).size}`, inline: true },
      { name: '📦 Articles',   value: `${db.articles.length}`, inline: true },
      { name: '⚡ Cmds custom',value: `${Object.keys(db.customCmds).length}`, inline: true },
      { name: '🎫 Tickets',    value: `${Object.keys(db.ticketMap).length}`, inline: true },
    ).setTimestamp()] });
  }

  if (cmd === 'rapport') {
    await interaction.deferReply();
    const g = interaction.guild; await g.fetch();
    const topEco = Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,3).map(([id,d],i)=>`${['🥇','🥈','🥉'][i]} <@${id}> — ${d.points} pts`).join('\n') || 'Aucun';
    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`📑 Rapport — ${g.name}`).setColor(C('#f0b429')).addFields(
      { name: '👥 Membres', value: `${g.memberCount}`, inline: true },
      { name: '📦 Boutique', value: `${db.articles.length} articles`, inline: true },
      { name: '⚡ Cmds custom', value: `${Object.keys(db.customCmds).length}`, inline: true },
      { name: '🏆 Top Économie', value: topEco },
    ).setTimestamp()] });
  }

  if (cmd === 'profil') {
    const t = interaction.options.getMember('membre') || interaction.member;
    const u = getUser(t.id);
    const needed = u.level * 100;
    const bar = '█'.repeat(Math.floor((u.xp/needed)*10))+'░'.repeat(10-Math.floor((u.xp/needed)*10));
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${t.user.username}`).setThumbnail(t.user.displayAvatarURL({dynamic:true})).setColor(C('#5865F2')).addFields(
      { name: '💰 Points', value: `**${u.points}** pts (Rang #${rank(t.id)})`, inline: true },
      { name: '⭐ Niveau', value: `**${u.level}** (${u.xp}/${needed} XP)`, inline: true },
      { name: '📊 Barre XP', value: `[${bar}] ${Math.floor((u.xp/needed)*100)}%`, inline: false },
    ).setTimestamp()] });
  }

  if (cmd === 'avatar') {
    const u = interaction.options.getUser('membre') || interaction.user;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${u.username}`).setImage(u.displayAvatarURL({dynamic:true,size:1024})).setColor(C('#5865F2'))] });
  }

  if (cmd === 'ajouter-article') {
    const article = { id: Date.now(), name: interaction.options.getString('nom'), price: interaction.options.getString('prix'), link: interaction.options.getString('lien'), description: interaction.options.getString('description')||'', emoji: interaction.options.getString('emoji')||'🛒', category: interaction.options.getString('categorie')||'', stock: interaction.options.getInteger('stock')??-1, image: interaction.options.getString('image')||'', visible: true, createdAt: new Date().toLocaleString('fr-FR') };
    db.articles.push(article);
    log(`🛒 Article ajouté: ${article.name}`);
    return interaction.reply({ embeds: [OK('Article ajouté !', `**${article.emoji} ${article.name}** — ${article.price}`)] });
  }

  if (cmd === 'supprimer-article') {
    const nom = interaction.options.getString('nom').toLowerCase();
    const idx = db.articles.findIndex(a => a.name.toLowerCase().includes(nom));
    if (idx < 0) return interaction.reply({ embeds: [ERR(`"${nom}" introuvable.`)], ephemeral: true });
    const a = db.articles.splice(idx, 1)[0];
    return interaction.reply({ embeds: [OK('Article supprimé', `**${a.name}** retiré.`)] });
  }

  if (cmd === 'modifier-article') {
    const nom = interaction.options.getString('nom').toLowerCase();
    const a = db.articles.find(x => x.name.toLowerCase().includes(nom));
    if (!a) return interaction.reply({ embeds: [ERR(`"${nom}" introuvable.`)], ephemeral: true });
    const prix = interaction.options.getString('prix');
    const stock = interaction.options.getInteger('stock');
    const desc = interaction.options.getString('description');
    if (prix) a.price = prix;
    if (stock !== null) a.stock = stock;
    if (desc) a.description = desc;
    return interaction.reply({ embeds: [OK('Article modifié !', `**${a.name}** mis à jour.`)] });
  }

  if (cmd === 'liste-articles') {
    if (!db.articles.length) return interaction.reply({ embeds: [INF('Boutique vide', 'Utilisez `/ajouter-article`.')] });
    const emb = new EmbedBuilder().setTitle(`🛒 Articles (${db.articles.length})`).setColor(C('#f0b429')).setTimestamp();
    db.articles.forEach(a => emb.addFields({ name: `${a.emoji} ${a.name}`, value: `${a.price} • ${a.stock===-1?'♾️':a.stock===0?'❌':'✅ '+a.stock}`, inline: true }));
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'shop') return interaction.reply({ embeds: [buildShopEmbed()] });

  if (cmd === 'article') {
    const a = db.articles.find(x => x.name.toLowerCase().includes(interaction.options.getString('nom').toLowerCase()));
    if (!a) return interaction.reply({ embeds: [ERR('Introuvable.')], ephemeral: true });
    return interaction.reply({ embeds: [articleEmbed(a)] });
  }

  if (cmd === 'publier-shop') {
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const mention = interaction.options.getString('mention') || '';
    await target.send({ content: mention || undefined, embeds: [buildShopEmbed()] });
    return interaction.reply({ embeds: [OK('Boutique publiée !', `Dans ${target}.`)], ephemeral: true });
  }

  if (cmd === 'publier-article') {
    const a = db.articles.find(x => x.name.toLowerCase().includes(interaction.options.getString('nom').toLowerCase()));
    if (!a) return interaction.reply({ embeds: [ERR('Introuvable.')], ephemeral: true });
    const target = interaction.options.getChannel('channel') || interaction.channel;
    await target.send({ embeds: [articleEmbed(a)] });
    return interaction.reply({ embeds: [OK('Article publié !', `**${a.name}** dans ${target}.`)], ephemeral: true });
  }

  if (cmd === 'config-shop') {
    const cfg = db.shopConfig;
    const n = interaction.options.getString('nom'), col = interaction.options.getString('couleur'), ban = interaction.options.getString('banner'), ft = interaction.options.getString('footer');
    if (n) cfg.name = n; if (col) cfg.color = col; if (ban) cfg.banner = ban; if (ft) cfg.footer = ft;
    return interaction.reply({ embeds: [OK('Config sauvegardée !', `Nom : **${cfg.name}**`)] });
  }

  if (cmd === 'generer-regles') {
    const type = interaction.options.getString('type');
    const target = interaction.options.getChannel('channel');
    const rules = RULES_TEMPLATES[type] || RULES_TEMPLATES.vente;
    const emb = new EmbedBuilder().setTitle('📜 Règles du Serveur').setColor(C('#e74c3c')).setTimestamp().setFooter({ text: 'Non-respect = sanctions' });
    rules.forEach((r, i) => emb.addFields({ name: `${r.e} ${i+1}. ${r.t}`, value: r.d }));
    if (target) { await target.send({ embeds: [emb] }); return interaction.reply({ embeds: [OK('Règles publiées !', `Dans ${target}.`)], ephemeral: true }); }
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'generer-bienvenue') {
    const preview = WELCOME_TEMPLATES[0].replace('{user}','@Nouveau membre').replace('{server}',interaction.guild.name).replace('{count}',interaction.guild.memberCount.toString());
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('👋 Template de bienvenue').setDescription(preview).setColor(C('#5865F2')).setTimestamp()] });
  }

  const SALON_CONFIGS = {
    shop:     { name: '🛒・boutique',  topic: 'Notre boutique' },
    rules:    { name: '📜・règles',     topic: 'Règles du serveur' },
    welcome:  { name: '👋・bienvenue', topic: 'Bienvenue' },
    tickets:  { name: '🎫・tickets',   topic: 'Support' },
    annonces: { name: '📢・annonces',  topic: 'Annonces' },
    general:  { name: '💬・général',   topic: 'Discussion' },
  };

  if (cmd === 'setup-salon') {
    const type = interaction.options.getString('type');
    const config = SALON_CONFIGS[type];
    if (!config) return interaction.reply({ embeds: [ERR('Type invalide.')], ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const ch = await interaction.guild.channels.create({ name: config.name, type: ChannelType.GuildText, topic: config.topic });
      if (type === 'tickets') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('t_open_cmd').setLabel('📦 Commande').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('t_open_sup').setLabel('🔧 Support').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('t_open_q').setLabel('❓ Question').setStyle(ButtonStyle.Success)
        );
        await ch.send({ embeds: [new EmbedBuilder().setTitle('🎫 Centre de Support').setDescription('Choisissez la catégorie :').setColor(C('#5865F2')).setTimestamp()], components: [row] });
      }
      if (type === 'shop' && db.articles.length > 0) await ch.send({ embeds: [buildShopEmbed()] });
      return interaction.editReply({ content: `✅ Salon ${config.name} créé : <#${ch.id}>` });
    } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
  }

  if (cmd === 'setup-serveur') {
    const type = interaction.options.getString('type');
    await interaction.deferReply({ ephemeral: true });
    const created = [];
    for (const s of ['rules','welcome','shop','tickets','annonces','general']) {
      try { const cfg = SALON_CONFIGS[s]; const ch = await interaction.guild.channels.create({ name: cfg.name, type: ChannelType.GuildText, topic: cfg.topic }); created.push(`<#${ch.id}>`); } catch(e) {}
    }
    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🚀 Serveur configuré !').setColor(C('#10d982')).setDescription(`**${created.length} salons créés :**\n${created.join('\n')}`).setTimestamp()] });
  }

  if (cmd === 'annonce') {
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const ment = interaction.options.getString('mention') || '';
    const img = interaction.options.getString('image') || '';
    const emb = new EmbedBuilder().setTitle(`📢 ${interaction.options.getString('titre')}`).setDescription(interaction.options.getString('message')).setColor(C(interaction.options.getString('couleur') || '#5865F2')).setTimestamp().setFooter({ text: `Annoncé par ${interaction.user.username}` });
    if (img) emb.setImage(img);
    await target.send({ content: ment || undefined, embeds: [emb] });
    return interaction.reply({ embeds: [OK('Annonce envoyée', `Dans ${target}.`)], ephemeral: true });
  }

  if (cmd === 'message-perso') {
    const target = interaction.options.getChannel('channel') || interaction.channel;
    await target.send({ content: interaction.options.getString('contenu') });
    return interaction.reply({ embeds: [OK('Message envoyé', `Dans ${target}.`)], ephemeral: true });
  }

  if (cmd === 'bouton') {
    const texte = interaction.options.getString('texte'), lien = interaction.options.getString('lien'), message = interaction.options.getString('message') || '';
    if (!lien.startsWith('http')) return interaction.reply({ embeds: [ERR('URL invalide.')], ephemeral: true });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(texte).setStyle(ButtonStyle.Link).setURL(lien));
    const payload = { components: [row] };
    if (message) payload.embeds = [new EmbedBuilder().setDescription(message).setColor(C('#5865F2'))];
    else payload.content = '\u200b';
    await (interaction.options.getChannel('channel') || interaction.channel).send(payload);
    return interaction.reply({ embeds: [OK('Bouton envoyé !', '')], ephemeral: true });
  }

  if (cmd === 'boutons') {
    const titre = interaction.options.getString('titre'), desc = interaction.options.getString('description')||'', couleur = interaction.options.getString('couleur')||'#5865F2', target = interaction.options.getChannel('channel')||interaction.channel, mention = interaction.options.getString('mention')||'';
    const btnsRaw = ['btn1','btn2','btn3'].map(k=>interaction.options.getString(k)).filter(Boolean);
    const buttons = btnsRaw.map(raw => { const [label,url] = raw.split('|'); return url?.startsWith('http') ? new ButtonBuilder().setLabel(label.trim()).setStyle(ButtonStyle.Link).setURL(url.trim()) : null; }).filter(Boolean);
    if (!buttons.length) return interaction.reply({ embeds: [ERR('Aucun bouton valide.')], ephemeral: true });
    const emb = new EmbedBuilder().setTitle(titre).setColor(C(couleur)).setTimestamp();
    if (desc) emb.setDescription(desc);
    const payload = { embeds: [emb], components: [new ActionRowBuilder().addComponents(...buttons)] };
    if (mention) payload.content = mention;
    await target.send(payload);
    return interaction.reply({ embeds: [OK(`${buttons.length} bouton(s) envoyé(s) !`, `Dans ${target}.`)], ephemeral: true });
  }

  if (cmd === 'ma-boutique') {
    await interaction.deferReply({ ephemeral: true });
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const mention = interaction.options.getString('mention') || '';
    const cfg = db.boutiqueConfig;
    const mainEmb = new EmbedBuilder().setTitle(`🛒 ${cfg.nom||'NexusStore'}`).setColor(C('#f0b429')).setDescription('✅ **Livraison instantanée**\n🔒 **100% Sécurisé**\n💸 **Remboursement assuré**').setTimestamp();
    if (cfg.lien) mainEmb.addFields({ name: '🔗 Boutique', value: `[**→ Voir tous les produits**](${cfg.lien})`, inline: false });
    const buttons = [];
    if (cfg.lien)       buttons.push(new ButtonBuilder().setLabel('🛒 Boutique').setStyle(ButtonStyle.Link).setURL(cfg.lien));
    if (cfg.stripeLien) buttons.push(new ButtonBuilder().setLabel('💳 Stripe').setStyle(ButtonStyle.Link).setURL(cfg.stripeLien));
    if (cfg.sumupLien)  buttons.push(new ButtonBuilder().setLabel('💳 Sumup').setStyle(ButtonStyle.Link).setURL(cfg.sumupLien));
    const payload = { embeds: [mainEmb] };
    if (buttons.length) payload.components = [new ActionRowBuilder().addComponents(...buttons.slice(0,5))];
    if (mention) payload.content = mention;
    await target.send(payload);
    for (const art of db.articles.filter(a => a.visible !== false && a.stock !== 0)) {
      await target.send({ embeds: [articleEmbed(art)] });
      await new Promise(r => setTimeout(r, 600));
    }
    return interaction.editReply({ content: `✅ Boutique publiée dans ${target} !` });
  }

  if (cmd === 'contact') {
    const cfg = db.boutiqueConfig;
    const emb = new EmbedBuilder().setTitle(`📧 Contact — ${cfg.nom||'NexusStore'}`).setColor(C('#4d8fff')).setTimestamp();
    if (cfg.emailContact) emb.addFields({ name: '📧 Email', value: `\`${cfg.emailContact}\``, inline: false });
    emb.addFields({ name: '🎫 Support Discord', value: 'Ouvrez un ticket avec `/ticket`', inline: false });
    const buttons = [];
    if (cfg.emailContact) buttons.push(new ButtonBuilder().setLabel('📧 Email').setStyle(ButtonStyle.Link).setURL(`mailto:${cfg.emailContact}`));
    buttons.push(new ButtonBuilder().setLabel('🎫 Ticket').setStyle(ButtonStyle.Primary).setCustomId('t_open_sup'));
    return interaction.reply({ embeds: [emb], components: [new ActionRowBuilder().addComponents(...buttons)] });
  }

  if (cmd === 'paiements') {
    const cfg = db.boutiqueConfig;
    const emb = new EmbedBuilder().setTitle('💳 Moyens de Paiement').setColor(C('#10d982')).setTimestamp();
    if (cfg.stripeLien) emb.addFields({ name: '💳 Carte bancaire (Stripe)', value: `[**→ Payer par carte**](${cfg.stripeLien})`, inline: true });
    if (cfg.sumupLien)  emb.addFields({ name: '💳 Sumup', value: `[**→ Payer via Sumup**](${cfg.sumupLien})`, inline: true });
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'config-boutique') {
    const cfg = db.boutiqueConfig;
    ['lien','email_contact','stripe_lien','sumup_lien','nom'].forEach(k => { const v = interaction.options.getString(k); if (v) cfg[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())] = v; });
    return interaction.reply({ embeds: [OK('Boutique configurée !', `Nom : **${cfg.nom}**`)], ephemeral: true });
  }

  if (cmd === 'epingler') {
    try { const msg = await interaction.channel.messages.fetch(interaction.options.getString('messageid')); await msg.pin(); return interaction.reply({ embeds: [OK('Épinglé !', '')] }); }
    catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); }
  }

  if (cmd === 'regles') {
    const rules = RULES_TEMPLATES.vente;
    const emb = new EmbedBuilder().setTitle('📜 Règles du Serveur').setColor(C('#e74c3c')).setTimestamp();
    rules.slice(0,7).forEach((r,i) => emb.addFields({name:`${r.e} ${i+1}. ${r.t}`,value:r.d.substring(0,100)}));
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'warn') {
    const t = interaction.options.getMember('membre'), r = interaction.options.getString('raison');
    if (!db.warns[t.id]) db.warns[t.id] = [];
    db.warns[t.id].push({ reason: r, modId: interaction.user.id, date: new Date().toLocaleString('fr-FR') });
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ Avertissement').setColor(C('#f0b429')).addFields({ name: '👤 Membre', value: `${t}`, inline: true },{ name: '📝 Raison', value: r, inline: true },{ name: '🔢 Total', value: `${db.warns[t.id].length}`, inline: true }).setTimestamp()] });
    t.send({ embeds: [new EmbedBuilder().setTitle('⚠️ Avertissement reçu').setDescription(`**Serveur :** ${interaction.guild.name}\n**Raison :** ${r}`).setColor(C('#f0b429')).setTimestamp()] }).catch(() => {});
    return;
  }

  if (cmd === 'warns') {
    const t = interaction.options.getMember('membre'), warns = db.warns[t.id] || [];
    const emb = new EmbedBuilder().setTitle(`⚠️ Warns — ${t.user.username}`).setColor(C('#f0b429'));
    if (!warns.length) emb.setDescription('✅ Aucun avertissement.');
    else warns.forEach((w,i) => emb.addFields({ name: `#${i+1} • ${w.date}`, value: w.reason }));
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'clearwarns') { const t = interaction.options.getMember('membre'); db.warns[t.id] = []; return interaction.reply({ embeds: [OK('Warns effacés', `Avertissements de ${t} supprimés.`)] }); }

  if (cmd === 'sanctions') {
    const t = interaction.options.getMember('membre'), warns = db.warns[t.id] || [];
    const emb = new EmbedBuilder().setTitle(`📋 Sanctions — ${t.user.username}`).setColor(C('#ff4d4d')).addFields({ name: '⚠️ Warns', value: `${warns.length}`, inline: true },{ name: '💰 Points', value: `${getUser(t.id).points}`, inline: true });
    warns.forEach((w,i) => emb.addFields({name:`Warn #${i+1}`,value:`${w.date}: ${w.reason}`}));
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'kick') { const t = interaction.options.getMember('membre'), r = interaction.options.getString('raison')||'Aucune raison'; if (!t.kickable) return interaction.reply({ embeds: [ERR('Impossible.')], ephemeral: true }); await t.kick(r); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('👢 Expulsé').setColor(C('#ff4d4d')).addFields({name:'Membre',value:t.user.username,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()] }); }

  if (cmd === 'ban') { const t = interaction.options.getMember('membre'), r = interaction.options.getString('raison')||'Aucune raison'; if (!t.bannable) return interaction.reply({ embeds: [ERR('Impossible.')], ephemeral: true }); t.send({ embeds: [ERR(`Banni de **${interaction.guild.name}**. Raison : ${r}`)] }).catch(()=>{}); await t.ban({ reason: r }); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔨 Banni').setColor(C('#ff4d4d')).addFields({name:'Membre',value:t.user.username,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()] }); }

  if (cmd === 'unban') { try { await interaction.guild.members.unban(interaction.options.getString('userid')); return interaction.reply({ embeds: [OK('Débanni', '')] }); } catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); } }

  if (cmd === 'mute') { const t = interaction.options.getMember('membre'), min = interaction.options.getInteger('minutes')||10, r = interaction.options.getString('raison')||'Aucune raison'; try { await t.timeout(min*60000, r); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔇 Sourdine').setColor(C('#f0b429')).addFields({name:'Membre',value:`${t}`,inline:true},{name:'Durée',value:`${min}min`,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()] }); } catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); } }

  if (cmd === 'unmute') { try { await interaction.options.getMember('membre').timeout(null); return interaction.reply({ embeds: [OK('Sourdine levée', '')] }); } catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); } }

  if (cmd === 'clear') { try { const d = await interaction.channel.bulkDelete(interaction.options.getInteger('nombre'), true); return interaction.reply({ embeds: [OK(`${d.size} messages supprimés`, '')], ephemeral: true }); } catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); } }

  if (cmd === 'lock')   { await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false }); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔒 Verrouillé').setColor(C('#ff4d4d')).setTimestamp()] }); }
  if (cmd === 'unlock') { await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null  }); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔓 Déverrouillé').setColor(C('#10d982')).setTimestamp()] }); }
  if (cmd === 'slowmode') { await interaction.channel.setRateLimitPerUser(interaction.options.getInteger('secondes')); return interaction.reply({ embeds: [OK('Slow mode mis à jour', '')] }); }

  if (cmd === 'ticket') { await interaction.deferReply({ ephemeral: true }); try { const r = await openTicket(interaction.guild, interaction.user); if (r.already) return interaction.editReply({ content: `❌ Existant : <#${r.channel.id}>` }); return interaction.editReply({ content: `✅ Créé : <#${r.channel.id}>` }); } catch(e) { return interaction.editReply({ content: `❌ ${e.message}` }); } }

  if (cmd === 'fermer') { if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ embeds: [ERR('Pas dans un ticket.')], ephemeral: true }); await interaction.reply({ content: '🔒 Fermeture dans 5 secondes...' }); return closeTicket(interaction.channel, interaction.user); }

  if (cmd === 'add') { const t = interaction.options.getMember('membre'); await interaction.channel.permissionOverwrites.edit(t.id, { ViewChannel: true, SendMessages: true }); return interaction.reply({ embeds: [OK('Membre ajouté', `${t} a accès à ce ticket.`)] }); }
  if (cmd === 'retirer') { const t = interaction.options.getMember('membre'); await interaction.channel.permissionOverwrites.edit(t.id, { ViewChannel: false }); return interaction.reply({ embeds: [OK('Membre retiré', `${t} n'a plus accès.`)] }); }
  if (cmd === 'renommer-ticket') { if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ embeds: [ERR('Pas dans un ticket.')], ephemeral: true }); const nom = interaction.options.getString('nom').toLowerCase().replace(/\s+/g,'-'); await interaction.channel.setName(`ticket-${nom}`); return interaction.reply({ embeds: [OK('Renommé', `ticket-${nom}`)] }); }

  if (cmd === 'points') { const t = interaction.options.getUser('membre')||interaction.user; const u = getUser(t.id); return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`💰 ${t.username}`).setColor(C('#f0b429')).addFields({name:'💰 Points',value:`**${u.points}**`,inline:true},{name:'🏆 Rang',value:`#${rank(t.id)}`,inline:true}).setTimestamp()] }); }

  if (cmd === 'niveau') { const t = interaction.options.getUser('membre')||interaction.user; const u = getUser(t.id); const needed = u.level*100; const pct = Math.floor((u.xp/needed)*100); const bar = '█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10)); return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`⭐ Niveau — ${t.username}`).setColor(C('#9d6fff')).addFields({name:'⭐ Niveau',value:`**${u.level}**`,inline:true},{name:'📊 XP',value:`${u.xp}/${needed}`,inline:true},{name:'📈 Progression',value:`[${bar}] ${pct}%`,inline:false}).setTimestamp()] }); }

  if (cmd === 'daily') { const u = getUser(interaction.user.id); const cd = 24*3600000; if (Date.now()-u.lastDaily<cd) { const h = Math.ceil((cd-(Date.now()-u.lastDaily))/3600000); return interaction.reply({ embeds: [ERR(`Reviens dans **${h}h**.`)], ephemeral: true }); } const gain = Math.floor(Math.random()*151)+50; u.lastDaily = Date.now(); addPts(interaction.user.id, gain); addXP(interaction.user.id, 20); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎁 Daily récupéré !').setDescription(`+**${gain} points** !\nTotal : **${u.points} points**`).setColor(C('#10d982')).setTimestamp()] }); }

  if (cmd === 'classement') { const top = Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,10); const medals=['🥇','🥈','🥉']; return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Classement Points').setDescription(top.length?top.map(([id,d],i)=>`${medals[i]||`**${i+1}.**`} <@${id}> — **${d.points} pts**`).join('\n'):'Aucun').setColor(C('#f0b429')).setTimestamp()] }); }

  if (cmd === 'classement-xp') { const top = Object.entries(db.economy).sort(([,a],[,b])=>b.level-a.level).slice(0,10); const medals=['🥇','🥈','🥉']; return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⭐ Classement XP').setDescription(top.length?top.map(([id,d],i)=>`${medals[i]||`**${i+1}.**`} <@${id}> — Niveau **${d.level}**`).join('\n'):'Aucun').setColor(C('#9d6fff')).setTimestamp()] }); }

  if (cmd === 'donner-points') { const t = interaction.options.getUser('membre'), n = interaction.options.getInteger('montant'); addPts(t.id, n); return interaction.reply({ embeds: [OK('Points donnés', `**+${n} pts** à <@${t.id}>. Total : **${getUser(t.id).points} pts**`)] }); }

  if (cmd === 'shop-roles') { if (!db.roleShop.length) return interaction.reply({ embeds: [INF('Boutique vide', 'Aucun rôle en vente.')] }); const u = getUser(interaction.user.id); const emb = new EmbedBuilder().setTitle('🛍️ Boutique de Rôles').setColor(C('#f0b429')).setDescription(`Vos points : **${u.points} pts**`); db.roleShop.forEach(r => { const role = interaction.guild.roles.cache.get(r.roleId); if (role) emb.addFields({ name: `@${role.name}`, value: `${r.price} points`, inline: true }); }); return interaction.reply({ embeds: [emb] }); }

  if (cmd === 'acheter-role') { const role = interaction.options.getRole('role'), item = db.roleShop.find(r=>r.roleId===role.id); if (!item) return interaction.reply({ embeds: [ERR('Ce rôle n\'est pas en vente.')], ephemeral: true }); const u = getUser(interaction.user.id); if (u.points<item.price) return interaction.reply({ embeds: [ERR(`Points insuffisants. Il faut **${item.price} pts**.`)], ephemeral: true }); u.points -= item.price; await interaction.member.roles.add(role); return interaction.reply({ embeds: [OK('Rôle acheté !', `**@${role.name}** pour **${item.price} pts** !\nSolde : **${u.points} pts**`)] }); }

  if (cmd === 'ajouter-role-shop') { const role = interaction.options.getRole('role'), prix = interaction.options.getInteger('prix'), i = db.roleShop.findIndex(r=>r.roleId===role.id); if (i>=0) db.roleShop[i].price=prix; else db.roleShop.push({roleId:role.id,price:prix}); return interaction.reply({ embeds: [OK('Rôle en vente !', `**@${role.name}** — **${prix} points**`)] }); }

  if (cmd === 'giveaway') { const prix = interaction.options.getString('prix'), minutes = interaction.options.getInteger('minutes'), target = interaction.options.getChannel('channel')||interaction.channel, end = Date.now()+minutes*60000, row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gw_join').setLabel('🎉 Participer').setStyle(ButtonStyle.Primary)), msg = await target.send({ embeds: [new EmbedBuilder().setTitle('🎉 GIVEAWAY').setDescription(`**Prix :** ${prix}\n⏱️ **Fin :** ${new Date(end).toLocaleString('fr-FR')}\n👥 **Participants :** 0`).setColor(C('#f0b429')).setTimestamp(new Date(end)).setFooter({text:`Par ${interaction.user.username}`})], components: [row] }); db.giveaways[msg.id] = { prize: prix, end, channel: target.id, entries: new Set(), ended: false }; return interaction.reply({ embeds: [OK('Giveaway créé !', `**${prix}** — ${minutes}min.`)], ephemeral: true }); }

  if (cmd === 'giveaway-fin') { const id = interaction.options.getString('messageid'); if (!db.giveaways[id]) return interaction.reply({ embeds: [ERR('Introuvable.')], ephemeral: true }); await endGiveaway(id, interaction.guild); return interaction.reply({ embeds: [OK('Terminé !', '')], ephemeral: true }); }

  if (cmd === 'giveaway-reroll') { const gw = db.giveaways[interaction.options.getString('messageid')]; if (!gw) return interaction.reply({ embeds: [ERR('Introuvable.')], ephemeral: true }); const entries=[...gw.entries]; if (!entries.length) return interaction.reply({ embeds: [ERR('Aucun participant.')], ephemeral: true }); const winner=entries[Math.floor(Math.random()*entries.length)]; gw.winner=winner; addPts(winner,100); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Nouveau Gagnant !').setDescription(`**Prix :** ${gw.prize}\n**Gagnant :** <@${winner}>`).setColor(C('#10d982')).setTimestamp()] }); }

  if (cmd === 'sondage') { const question = interaction.options.getString('question'), opts = interaction.options.getString('options').split('|').map(s=>s.trim()).filter(Boolean).slice(0,9); if (opts.length<2) return interaction.reply({ embeds: [ERR('Minimum 2 options.')], ephemeral: true }); const emojis=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'], msg=await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📊 ${question}`).setDescription(opts.map((o,i)=>`${emojis[i]} ${o}`).join('\n')).setColor(C('#4d8fff')).setTimestamp().setFooter({text:`Par ${interaction.user.username}`})], fetchReply: true }); db.polls[msg.id]={question,options:opts,votes:Object.fromEntries(opts.map((_,i)=>[i,[]]))}; for(let i=0;i<opts.length;i++) await msg.react(emojis[i]); return; }

  if (cmd === 'resultats') { const poll = db.polls[interaction.options.getString('messageid')]; if (!poll) return interaction.reply({ embeds: [ERR('Introuvable.')], ephemeral: true }); const total=Object.values(poll.votes).reduce((s,v)=>s+v.length,0); const emb=new EmbedBuilder().setTitle(`📊 Résultats — ${poll.question}`).setColor(C('#4d8fff')); poll.options.forEach((o,i)=>{const votes=poll.votes[i]?.length||0,pct=total>0?Math.round((votes/total)*100):0,bar='█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10));emb.addFields({name:o,value:`[${bar}] **${pct}%** (${votes} vote(s))`});}); emb.setFooter({text:`${total} vote(s)`}).setTimestamp(); return interaction.reply({ embeds: [emb] }); }

  if (cmd === 'donner-role') { const t=interaction.options.getMember('membre'),r=interaction.options.getRole('role'); try{await t.roles.add(r);return interaction.reply({embeds:[OK('Rôle donné',`**@${r.name}** → ${t}`)],ephemeral:true});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }
  if (cmd === 'retirer-role') { const t=interaction.options.getMember('membre'),r=interaction.options.getRole('role'); try{await t.roles.remove(r);return interaction.reply({embeds:[OK('Rôle retiré',`**@${r.name}** retiré de ${t}`)],ephemeral:true});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  if (cmd === 'reaction-role') {
    const titre=interaction.options.getString('titre'),paires=interaction.options.getString('paires'),target=interaction.options.getChannel('channel')||interaction.channel,pairs=paires.split('|').map(p=>p.trim()).filter(Boolean),rrMap={},lines=[];
    for (const p of pairs) { const [emoji,roleId]=p.split(':'); if(!emoji||!roleId) continue; rrMap[emoji.trim()]=roleId.trim(); const role=interaction.guild.roles.cache.get(roleId.trim()); lines.push(`${emoji.trim()} → ${role?`@${role.name}`:roleId}`); }
    const emb=new EmbedBuilder().setTitle(titre).setDescription('Cliquez sur une réaction pour obtenir le rôle :\n\n'+lines.join('\n')).setColor(C('#f0b429')).setTimestamp();
    const msg=await target.send({embeds:[emb]});
    db.reactionRoles[msg.id]=rrMap;
    for (const emoji of Object.keys(rrMap)) await msg.react(emoji).catch(()=>{});
    return interaction.reply({embeds:[OK('Reaction roles créé !',`${Object.keys(rrMap).length} rôle(s) dans ${target}`)],ephemeral:true});
  }

  if (cmd === 'postuler') {
    const modal=new ModalBuilder().setCustomId('app_modal').setTitle('📝 Candidature');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q1').setLabel('Pourquoi rejoindre l\'équipe ?').setStyle(TextInputStyle.Paragraph).setMinLength(30).setMaxLength(500).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q2').setLabel('Ton expérience ?').setStyle(TextInputStyle.Paragraph).setMinLength(20).setMaxLength(300).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q3').setLabel('Disponibilité par semaine ?').setStyle(TextInputStyle.Short).setRequired(true))
    );
    return interaction.showModal(modal);
  }

  if (cmd === 'candidatures') {
    if (!db.applications.length) return interaction.reply({ embeds: [INF('Candidatures', 'Aucune.')], ephemeral: true });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📋 Candidatures (${db.applications.length})`).setColor(C('#f0b429')).setDescription(db.applications.map((a,i)=>`**${i+1}.** ${a.username} — ${a.status} — ${a.date}`).join('\n')).setTimestamp()], ephemeral: true });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ─── EXPRESS + API REST PANEL ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());

// ── Middleware auth panel ────────────────────────────────────
function authPanel(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) {
    res.setHeader('WWW-Authenticate', 'Basic realm="NexusBot Panel"');
    return res.status(401).json({ error: 'Non autorisé' });
  }
  const [, encoded] = auth.split(' ');
  const decoded = Buffer.from(encoded, 'base64').toString();
  const pass = decoded.split(':').slice(1).join(':'); // Supporte les : dans le mot de passe
  if (pass !== PANEL_PASSWORD) return res.status(403).json({ error: 'Mot de passe incorrect' });
  next();
}

// ── Fichiers statiques du panel (protégés) ───────────────────
app.use('/admin', authPanel, express.static(path.join(__dirname, 'public')));

// ── Routes API ───────────────────────────────────────────────

// Statut du bot
app.get('/api/status', authPanel, (req, res) => {
  const guild = client.guilds.cache.get(GUILD_ID);
  res.json({
    online:      !!client.user,
    tag:         client.user?.tag || 'Non connecté',
    ping:        client.ws.ping,
    uptime:      client.uptime,
    guildName:   guild?.name || '—',
    memberCount: guild?.memberCount || 0,
    customCmds:  Object.keys(db.customCmds).length,
    articles:    db.articles.length,
    tickets:     Object.keys(db.ticketMap).length,
  });
});

// Logs du panel
app.get('/api/logs', authPanel, (req, res) => {
  res.json(db.panelLogs.slice(0, 100));
});

// ─── COMMANDES CUSTOM ────────────────────────────────────────

// GET — liste toutes les commandes custom
app.get('/api/cmds', authPanel, (req, res) => {
  res.json(Object.entries(db.customCmds).map(([name, data]) => ({ name, ...data })));
});

// POST — créer ou modifier une commande custom
app.post('/api/cmds', authPanel, (req, res) => {
  const { name, desc, reponse, code, type, color, ephemeral } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });

  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  if (!safeName) return res.status(400).json({ error: 'Nom invalide' });

  db.customCmds[safeName] = { desc: desc || '', reponse: reponse || '', code: code || '', type: type || 'text', color: color || '#f0b429', ephemeral: !!ephemeral, updatedAt: new Date().toLocaleString('fr-FR') };

  log(`⚡ Commande custom créée/modifiée : /${safeName}`);
  res.json({ ok: true, name: safeName, cmd: db.customCmds[safeName] });
});

// DELETE — supprimer une commande custom
app.delete('/api/cmds/:name', authPanel, (req, res) => {
  const name = req.params.name.toLowerCase();
  if (!db.customCmds[name]) return res.status(404).json({ error: 'Commande introuvable' });
  delete db.customCmds[name];
  log(`🗑️ Commande custom supprimée : /${name}`);
  res.json({ ok: true, deleted: name });
});

// ─── ARTICLES ────────────────────────────────────────────────

// GET — liste les articles
app.get('/api/articles', authPanel, (req, res) => {
  res.json(db.articles);
});

// POST — ajouter un article
app.post('/api/articles', authPanel, (req, res) => {
  const { name, price, link, description, emoji, category, stock, image } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Nom et prix requis' });

  const article = { id: Date.now(), name, price, link: link || '', description: description || '', emoji: emoji || '🛒', category: category || '', stock: stock ?? -1, image: image || '', visible: true, createdAt: new Date().toLocaleString('fr-FR') };
  db.articles.push(article);
  log(`🛒 Article ajouté depuis le panel: ${name}`);
  res.json({ ok: true, article });
});

// DELETE — supprimer un article
app.delete('/api/articles/:id', authPanel, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = db.articles.findIndex(a => a.id === id);
  if (idx < 0) return res.status(404).json({ error: 'Article introuvable' });
  const deleted = db.articles.splice(idx, 1)[0];
  log(`🗑️ Article supprimé: ${deleted.name}`);
  res.json({ ok: true, deleted });
});

// PUT — modifier un article
app.put('/api/articles/:id', authPanel, (req, res) => {
  const id  = parseInt(req.params.id);
  const art = db.articles.find(a => a.id === id);
  if (!art) return res.status(404).json({ error: 'Article introuvable' });
  Object.assign(art, req.body, { id }); // Protège l'id
  log(`✏️ Article modifié: ${art.name}`);
  res.json({ ok: true, article: art });
});

// ─── SHOP CONFIG ─────────────────────────────────────────────

app.get('/api/shop-config', authPanel, (req, res) => {
  res.json(db.shopConfig);
});

app.post('/api/shop-config', authPanel, (req, res) => {
  const { name, color, footer, description, banner, thumb } = req.body;
  if (name)        db.shopConfig.name        = name;
  if (color)       db.shopConfig.color       = color;
  if (footer)      db.shopConfig.footer      = footer;
  if (description) db.shopConfig.description = description;
  if (banner)      db.shopConfig.banner      = banner;
  if (thumb)       db.shopConfig.thumb       = thumb;
  log('⚙️ Config boutique mise à jour depuis le panel');
  res.json({ ok: true, config: db.shopConfig });
});

// ─── STATS ───────────────────────────────────────────────────

app.get('/api/stats', authPanel, async (req, res) => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    res.json({
      members:     guild.memberCount,
      channels:    guild.channels.cache.size,
      roles:       guild.roles.cache.size,
      articles:    db.articles.length,
      customCmds:  Object.keys(db.customCmds).length,
      tickets:     Object.keys(db.ticketMap).length,
      giveaways:   Object.values(db.giveaways).filter(g=>!g.ended).length,
      economy:     Object.keys(db.economy).length,
      topPoints:   Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,5).map(([id,d])=>({ id, points: d.points, level: d.level })),
    });
  } catch(e) { res.json({ error: e.message }); }
});

// ─── WARNS ───────────────────────────────────────────────────

app.get('/api/warns/:userId', authPanel, (req, res) => {
  res.json(db.warns[req.params.userId] || []);
});

// ─── ANNONCE DEPUIS LE PANEL ─────────────────────────────────

app.post('/api/announce', authPanel, async (req, res) => {
  const { channelId, title, message, color, mention } = req.body;
  if (!channelId || !message) return res.status(400).json({ error: 'channelId et message requis' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const ch    = guild?.channels.cache.get(channelId);
    if (!ch) return res.status(404).json({ error: 'Channel introuvable' });
    const emb = new EmbedBuilder().setTitle(title || '📢 Annonce').setDescription(message).setColor(C(color || '#5865F2')).setTimestamp().setFooter({ text: 'Panel NexusBot' });
    await ch.send({ content: mention || undefined, embeds: [emb] });
    log(`📢 Annonce envoyée dans #${ch.name} depuis le panel`);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── TESTER UN CODE DEPUIS LE PANEL ─────────────────────────

app.post('/api/exec', authPanel, async (req, res) => {
  // Test syntaxique du code sans l'exécuter réellement
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code requis' });
  const errors = [], warnings = [];
  const opens  = (code.match(/\{/g)||[]).length, closes = (code.match(/\}/g)||[]).length;
  if (opens !== closes) errors.push(`Accolades non balancées ({: ${opens}, }: ${closes})`);
  const po = (code.match(/\(/g)||[]).length, pc = (code.match(/\)/g)||[]).length;
  if (po !== pc) errors.push(`Parenthèses non balancées (: ${po}, ): ${pc})`);
  if (!code.includes('interaction.reply') && !code.includes('interaction.editReply') && !code.includes('deferReply'))
    warnings.push('Aucun interaction.reply() détecté');
  if (code.includes('process.env')) errors.push('Accès à process.env interdit dans le code custom');
  if (code.includes('require('))    errors.push('require() interdit dans le code custom');
  res.json({ ok: errors.length === 0, errors, warnings, lines: code.split('\n').length, chars: code.length });
});

// ─── WEBHOOK ROUTE DE BASE ───────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    status:      'ok',
    bot:         client.user?.tag || 'connecting...',
    articles:    db.articles.length,
    customCmds:  Object.keys(db.customCmds).length,
    panel:       '/admin/nexusbot-panel.html',
  });
});

app.post('/sellhub', async (req, res) => {
  res.status(200).json({ ok: true });
  const { event, data } = req.body || {};
  if ((event === 'order.created' || event === 'order.completed') && CH_SALES) {
    const guild = client.guilds.cache.get(GUILD_ID);
    const ch    = guild?.channels.cache.get(CH_SALES);
    if (ch) {
      const o = data || {};
      ch.send({ embeds: [new EmbedBuilder().setTitle('💰 Nouvelle Vente !').setColor(C('#10d982')).addFields({name:'📦 Produit',value:o.product?.name||'—',inline:true},{name:'💵 Montant',value:o.amount?parseFloat(o.amount).toFixed(2)+'€':'—',inline:true}).setTimestamp().setFooter({text:'Sellhub'})] });
    }
    if (data?.discordId && ROLE_VIP) {
      const g = client.guilds.cache.get(GUILD_ID);
      const m = await g?.members.fetch(data.discordId).catch(()=>null);
      if (m) { const r = g.roles.cache.get(ROLE_VIP); if (r) m.roles.add(r).catch(()=>{}); addPts(data.discordId, 50); }
    }
  }
});

app.listen(PORT, () => log(`🌐 Serveur démarré sur le port ${PORT} | Panel: /admin/nexusbot-panel.html`));

client.login(TOKEN).catch(e => { console.error('❌', e.message); process.exit(1); });

