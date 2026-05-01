// ═══════════════════════════════════════════════════════════════════
//  NexusBot PREMIUM COMPLET — MEE6 + Draftbot + Panel API
//  Toutes les fonctionnalités gratuites :
//  ✅ Modération complète + auto-mod
//  ✅ Niveaux XP + rôles automatiques par niveau
//  ✅ Économie complète
//  ✅ Tickets avancés
//  ✅ Giveaway, sondages, reaction roles
//  ✅ Messages de bienvenue stylés
//  ✅ Logs automatiques (join/leave/edit/delete/voice)
//  ✅ Stats vocaux en temps réel
//  ✅ Commandes fun (météo, blague, meme...)
//  ✅ Système de réputation
//  ✅ Rappels personnalisés
//  ✅ Sticky messages
//  ✅ Anniversaires
//  ✅ Commandes custom live via panel
//  ✅ Panel admin mobile connecté en live
// ═══════════════════════════════════════════════════════════════════

const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, ChannelType, REST, Routes,
  SlashCommandBuilder, Events, ActivityType,
} = require('discord.js');
const express = require('express');
const path    = require('path');

// ─── CONFIG ─────────────────────────────────────────────────
const TOKEN          = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.CLIENT_ID;
const GUILD_ID       = process.env.GUILD_ID;
const SH_KEY         = process.env.SELLHUB_KEY   || '';
const STORE_URL      = process.env.STORE_URL      || '';
const PORT           = process.env.PORT           || 3000;
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'admin123';
const CH_WELCOME     = process.env.CH_WELCOME     || '';
const CH_BYE         = process.env.CH_BYE         || '';
const CH_SALES       = process.env.CH_SALES       || '';
const CH_LOGS        = process.env.CH_LOGS        || '';
const CH_TICKETS     = process.env.CH_TICKETS     || '';
const ROLE_MEMBER    = process.env.ROLE_MEMBER    || '';
const ROLE_VIP       = process.env.ROLE_VIP       || '';
const ROLE_SUPPORT   = process.env.ROLE_SUPPORT   || '';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ DISCORD_TOKEN, CLIENT_ID et GUILD_ID requis');
  process.exit(1);
}

// ─── BASE DE DONNÉES EN MÉMOIRE ──────────────────────────────
const db = {
  // Boutique
  articles: [],
  shopConfig: {
    name: 'NexusStore', description: '', banner: '', thumb: '',
    color: '#f0b429', footer: 'Paiement 100% sécurisé 🔒',
    features: ['✅ **Livraison instantanée**','🔒 **100% Sécurisé**','🛠️ **Produits vérifiés**','💸 **Remboursement assuré**','⚡ **Ultra rapide**']
  },
  boutiqueConfig: {
    lien: STORE_URL, nom: process.env.STORE_NAME||'NexusStore',
    emailContact: process.env.EMAIL_CONTACT||'',
    emailPaiement: process.env.EMAIL_PAIEMENT||'',
    stripeLien: process.env.STRIPE_LIEN||'',
    sumupLien: process.env.SUMUP_LIEN||'',
  },
  sellhubProducts: [],

  // Économie & XP
  economy: {},       // { userId: { points, xp, level, lastDaily, lastMsg, totalEarned, messages } }
  levelRoles: [],    // [{ level: 5, roleId: '...' }]

  // Modération
  warns: {},         // { userId: [{ reason, modId, date }] }
  modConfig: {
    antispam: true, antilink: false, anticaps: false,
    autosanction: true, dm: true, logs: true,
    spamThreshold: 5, spamWindow: 5000,
    bannedWords: [],
  },
  spamTracker: {},   // { userId: { count, lastMsg } }

  // Tickets
  ticketMap: {},
  ticketCount: 0,
  ticketCategories: [
    { id:'commande',   label:'📦 Commande',    desc:'Problème avec un achat',      color:'#5865F2' },
    { id:'support',    label:'🔧 Support',     desc:'Aide technique',               color:'#f0b429' },
    { id:'question',   label:'❓ Question',    desc:'Renseignements généraux',      color:'#10d982' },
    { id:'litige',     label:'⚖️ Litige',      desc:'Contestation ou réclamation',  color:'#ff4d4d' },
    { id:'partenariat',label:'🤝 Partenariat', desc:'Demande de partenariat',       color:'#9d6fff' },
  ],     // { userId: channelId }

  // Giveaways & sondages
  giveaways: {},
  polls: {},

  // Commandes clients (suivi)
  orders: [],  // [{ id, userId, discordId, username, articleId, articleName, price, status, date, deliveryFile, notes }]

  // Page À propos
  aboutPage: {
    title: 'À propos de NexusStore',
    description: 'Bienvenue sur NexusStore, votre boutique Discord de confiance.',
    team: [],       // [{ name, role, avatar, discord }]
    stats: { orders:0, clients:0, rating:'5.0' },
    socials: { discord:'', twitter:'', instagram:'' },
  },

  // Reaction roles
  reactionRoles: {}, // { msgId: { emoji: roleId } }

  // Commandes custom (live depuis panel)
  customCmds: {},    // { name: { desc, reponse, code, type, color, ephemeral } }

  // Réputation
  rep: {},           // { userId: { total, lastGiven } }

  // Anniversaires
  birthdays: {},     // { userId: 'DD/MM' }

  // Rappels
  reminders: [],     // [{ userId, channelId, msg, time }]

  // Sticky messages
  sticky: {},        // { channelId: { msgId, content } }

  // Auto-rôles
  autoRoles: [],

  // Applications
  applications: [],

  // Role shop
  roleShop: [],

  // Stats vocaux
  voiceStats: {},    // { userId: { totalMinutes, sessions, lastJoin } }
  voiceActive: {},   // { userId: channelId } (membres actuellement en vocal)

  // Logs panel
  panelLogs: [],

  // Stats channels (salons vocaux compteurs)
  statsChannels: {},

  // Config serveur
  welcomeConfig: {
    enabled: !!CH_WELCOME,
    channelId: CH_WELCOME,
    message: '👋 Bienvenue **{user}** sur **{server}** !\nNous sommes maintenant **{count}** membres 🎉',
    color: '#5865F2',
  },
};

// ─── HELPERS ────────────────────────────────────────────────
const C   = h => parseInt((h||'#5865F2').replace('#',''), 16);
const log = m => {
  const entry = { time: new Date().toLocaleTimeString('fr-FR'), msg: m };
  console.log(`[${entry.time}] ${m}`);
  db.panelLogs.unshift(entry);
  if (db.panelLogs.length > 300) db.panelLogs.pop();
};

// Économie
function getUser(id) {
  if (!db.economy[id]) db.economy[id] = { points:0, xp:0, level:1, lastDaily:0, lastMsg:0, totalEarned:0, messages:0 };
  return db.economy[id];
}
function addXP(id, amount) {
  const u = getUser(id); u.xp += amount; u.messages++;
  const needed = u.level * 100;
  if (u.xp >= needed) { u.xp -= needed; u.level++; return true; }
  return false;
}
function addPts(id, n) { const u=getUser(id); u.points+=n; u.totalEarned+=n; return u.points; }
function rank(id) { return Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).findIndex(([i])=>i===id)+1; }

// Réputation
function getRep(id) { if (!db.rep[id]) db.rep[id]={total:0,lastGiven:0}; return db.rep[id]; }

// Embeds
const OK  = (t,d) => new EmbedBuilder().setTitle(`✅ ${t}`).setDescription(d).setColor(C('#10d982')).setTimestamp();
const ERR = d     => new EmbedBuilder().setTitle('❌ Erreur').setDescription(d).setColor(C('#ff4d4d')).setTimestamp();
const INF = (t,d) => new EmbedBuilder().setTitle(`ℹ️ ${t}`).setDescription(d).setColor(C('#4d8fff')).setTimestamp();

function articleEmbed(a) {
  const emb = new EmbedBuilder()
    .setTitle(`${a.emoji||'🛒'} ${a.name}`)
    .setColor(C(a.color||'#f0b429'))
    .setTimestamp()
    .setFooter({ text:`${db.shopConfig.name} • Paiement sécurisé 🔒` });
  if (a.description) emb.setDescription(a.description);
  const fields = [{ name:'💰 Prix', value:`**${a.price}**`, inline:true }];
  if (a.stock!==undefined) fields.push({ name:'📦 Stock', value:a.stock===0?'❌ Rupture':a.stock===-1?'♾️ Illimité':`✅ ${a.stock}`, inline:true });
  if (a.link) fields.push({ name:'🔗 Acheter', value:`[**→ Payer maintenant**](${a.link})`, inline:false });
  emb.addFields(fields);
  if (a.image) emb.setImage(a.image);
  return emb;
}

// ─── MISE À JOUR SALONS STATS VOCAUX ────────────────────────
async function updateStatsChannels(guild) {
  const sc = db.statsChannels;
  if (!sc.membersId && !sc.onlineId && !sc.botsId && !sc.voiceId) return;
  try {
    await guild.members.fetch();
    const total   = guild.memberCount;
    const humans  = guild.members.cache.filter(m => !m.user.bot).size;
    const bots    = guild.members.cache.filter(m => m.user.bot).size;
    const online  = guild.members.cache.filter(m => !m.user.bot && m.presence?.status && m.presence.status !== 'offline').size;
    const inVoice = Object.keys(db.voiceActive).length;
    const updates = [
      { id: sc.membersId, name: `👥 Membres : ${total}` },
      { id: sc.humansId,  name: `👤 Humains : ${humans}` },
      { id: sc.botsId,    name: `🤖 Bots : ${bots}` },
      { id: sc.onlineId,  name: `🟢 En ligne : ${online}` },
      { id: sc.voiceId,   name: `🎤 En vocal : ${inVoice}` },
      { id: sc.ticketsId, name: `🎫 Tickets : ${Object.keys(db.ticketMap).length}` },
      { id: sc.articlesId,name: `📦 Articles : ${db.articles.length}` },
    ];
    for (const u of updates) {
      if (!u.id) continue;
      const ch = guild.channels.cache.get(u.id);
      if (ch && ch.name !== u.name) await ch.setName(u.name).catch(() => {});
    }
  } catch (e) { log(`⚠️ updateStatsChannels: ${e.message}`); }
}

function buildShopEmbed() {
  const cfg = db.shopConfig;
  const arts = db.articles.filter(a=>a.visible!==false&&a.stock!==0);
  const emb = new EmbedBuilder()
    .setTitle(cfg.name||'🛒 Boutique')
    .setColor(C(cfg.color||'#f0b429'))
    .setTimestamp()
    .setFooter({ text:cfg.footer||'Paiement sécurisé 🔒' });
  if (cfg.description) emb.setDescription(cfg.description);
  else if (cfg.features?.length) emb.setDescription(cfg.features.join('\n'));
  if (cfg.banner) emb.setImage(cfg.banner);
  arts.forEach(a => {
    const stock = a.stock===-1?'♾️':a.stock===0?'❌':a.stock!=null?`✅ ${a.stock}`:'✅';
    emb.addFields({ name:`${a.emoji||'🛒'} ${a.name}`, value:`${stock} — **${a.price}**${a.link?`\n[**→ Acheter**](${a.link})`:''}`, inline:true });
  });
  if (STORE_URL) emb.addFields({ name:'\u200b', value:`[🌐 **Voir toute la boutique**](${STORE_URL})`, inline:false });
  return emb;
}

// ─── TICKETS ────────────────────────────────────────────────
// Envoyer le panel tickets avec menu déroulant
async function sendTicketPanel(channel) {
  const cats = db.ticketCategories;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category')
    .setPlaceholder('📋 Choisissez une catégorie...')
    .addOptions(cats.map(c=>({ label:c.label, description:c.desc, value:c.id })));
  const row = new ActionRowBuilder().addComponents(menu);
  const emb = new EmbedBuilder()
    .setTitle('🎫 Centre de Support')
    .setColor(C('#5865F2'))
    .setDescription('Sélectionnez la catégorie de votre demande :\n\n' + cats.map(c=>`${c.label} — *${c.desc}*`).join('\n'))
    .setFooter({ text:'Notre équipe vous répondra rapidement' })
    .setTimestamp();
  await channel.send({ embeds:[emb], components:[row] });
}

async function openTicket(guild, user, categoryId='support') {
  if (db.ticketMap[user.id]) {
    const ex = guild.channels.cache.get(db.ticketMap[user.id]);
    if (ex) return { already:true, channel:ex };
  }
  db.ticketCount = (db.ticketCount||0) + 1;
  const cat = db.ticketCategories?.find(c=>c.id===categoryId) || { id:'support', label:'🔧 Support', color:'#5865F2', desc:'Support' };
  const num  = String(db.ticketCount).padStart(4,'0');
  const name = `ticket-${num}-${user.username.toLowerCase().replace(/[^a-z0-9]/g,'').substring(0,12)}`;
  const perms = [
    { id:guild.id, deny:[PermissionFlagsBits.ViewChannel] },
    { id:user.id,  allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles] },
  ];
  if (ROLE_SUPPORT) perms.push({ id:ROLE_SUPPORT, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageMessages] });
  const opts = { name, type:ChannelType.GuildText, topic:`${cat.label} • ${user.tag||user.username} (${user.id}) • #${num}`, permissionOverwrites:perms };
  if (CH_TICKETS) { const cat2=guild.channels.cache.get(CH_TICKETS); if(cat2?.type===ChannelType.GuildCategory) opts.parent=CH_TICKETS; }
  const channel = await guild.channels.create(opts);
  db.ticketMap[user.id] = channel.id;
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('t_close').setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('t_claim').setLabel('✋ Prendre en charge').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('t_transcript').setLabel('📄 Transcript').setStyle(ButtonStyle.Secondary)
  );
  await channel.send({
    content:`${user}${ROLE_SUPPORT?` <@&${ROLE_SUPPORT}>`:''}`,
    embeds:[new EmbedBuilder()
      .setTitle(`${cat.label} — Ticket #${num}`)
      .setDescription(`Bienvenue ${user} ! 👋\n\nDécrivez votre demande en détail.\nNotez vos informations importantes (numéro de commande, captures...).`)
      .setColor(C(cat.color||'#5865F2'))
      .addFields(
        {name:'📋 Catégorie',value:cat.label,inline:true},
        {name:'👤 Utilisateur',value:user.tag||user.username,inline:true},
        {name:'⏱️ Réponse',value:'< 24h',inline:true},
        {name:'🔢 Ticket',value:`#${num}`,inline:true},
      )
      .setThumbnail(user.displayAvatarURL({dynamic:true}))
      .setTimestamp()
    ],
    components:[closeRow]
  });
  addPts(user.id, 5);
  if (CH_LOGS) { const l=guild.channels.cache.get(CH_LOGS); if(l) l.send({ embeds:[new EmbedBuilder().setTitle('🎫 Nouveau Ticket').setColor(C('#f0b429')).addFields({name:'Utilisateur',value:`${user.tag||user.username} (${user.id})`},{name:'Catégorie',value:cat.label},{name:'Salon',value:`<#${channel.id}>`},{name:'Ticket',value:`#${num}`}).setTimestamp()] }); }
  return { channel, num };
}

async function closeTicket(channel, closer) {
  const uid = Object.entries(db.ticketMap).find(([,cid])=>cid===channel.id)?.[0];
  if (uid) delete db.ticketMap[uid];
  // Transcript auto
  const msgs = await channel.messages.fetch({ limit:100 }).catch(()=>null);
  const txt = msgs ? [...msgs.values()].reverse().map(m=>`[${new Date(m.createdTimestamp).toLocaleString('fr-FR')}] ${m.author.username}: ${m.content||'[embed]'}`).join('\n') : '';
  await channel.send({ embeds:[new EmbedBuilder().setTitle('🔒 Ticket Fermé').setDescription(`Fermé par ${closer}. Suppression dans 10 secondes.`).setColor(C('#ff4d4d')).setTimestamp()] });
  if (CH_LOGS && txt) {
    const l = channel.guild.channels.cache.get(CH_LOGS);
    if (l) l.send({ embeds:[new EmbedBuilder().setTitle('📄 Transcript — Ticket fermé').setColor(C('#4d8fff')).addFields({name:'Salon',value:channel.name},{name:'Fermé par',value:`${closer}`}).setTimestamp()], files:[{ attachment:Buffer.from(txt,'utf-8'), name:`transcript-${channel.name}.txt` }] });
  }
  setTimeout(() => channel.delete().catch(()=>{}), 10000);
}

// ─── GIVEAWAY ────────────────────────────────────────────────
async function endGiveaway(msgId, guild) {
  const gw = db.giveaways[msgId];
  if (!gw||gw.ended) return;
  gw.ended = true;
  const ch = guild.channels.cache.get(gw.channel);
  const entries = [...gw.entries];
  if (!ch) return;
  if (!entries.length) return ch.send({ embeds:[ERR(`Giveaway **${gw.prize}** terminé — aucun participant.`)] });
  const winner = entries[Math.floor(Math.random()*entries.length)];
  gw.winner = winner;
  addPts(winner, 100);
  ch.send({ content:`🎉 <@${winner}>`, embeds:[new EmbedBuilder().setTitle('🎉 Giveaway Terminé !').setColor(C('#10d982')).addFields({name:'🏆 Prix',value:gw.prize,inline:true},{name:'🎊 Gagnant',value:`<@${winner}>`,inline:true},{name:'👥 Participants',value:`${entries.length}`,inline:true}).setTimestamp()] });
}

// ─── AUTO-MOD ────────────────────────────────────────────────
async function autoMod(msg) {
  if (!db.modConfig.antispam && !db.modConfig.antilink && !db.modConfig.anticaps && !db.modConfig.bannedWords?.length) return;
  const cfg = db.modConfig;
  let violated = null;

  // Anti-spam
  if (cfg.antispam) {
    if (!db.spamTracker[msg.author.id]) db.spamTracker[msg.author.id] = { count:0, lastMsg:0 };
    const tracker = db.spamTracker[msg.author.id];
    if (Date.now() - tracker.lastMsg < (cfg.spamWindow||5000)) {
      tracker.count++;
      if (tracker.count >= (cfg.spamThreshold||5)) {
        violated = '🚨 Spam détecté';
        tracker.count = 0;
      }
    } else {
      tracker.count = 1;
    }
    tracker.lastMsg = Date.now();
  }

  // Anti-lien
  if (!violated && cfg.antilink && /https?:\/\/|discord\.gg\//i.test(msg.content)) {
    const allowedRoles = [ROLE_SUPPORT, ROLE_VIP, ROLE_MEMBER].filter(Boolean);
    const hasRole = allowedRoles.some(r => msg.member?.roles.cache.has(r));
    if (!hasRole) violated = '🔗 Lien non autorisé';
  }

  // Anti-majuscules
  if (!violated && cfg.anticaps && msg.content.length > 10) {
    const caps = msg.content.replace(/[^A-Za-z]/g,'');
    if (caps.length > 5 && (caps.replace(/[^A-Z]/g,'').length / caps.length) > 0.7) violated = '🔠 Trop de majuscules';
  }

  // Mots bannis
  if (!violated && cfg.bannedWords?.length) {
    const lower = msg.content.toLowerCase();
    const found = cfg.bannedWords.find(w => lower.includes(w.toLowerCase()));
    if (found) violated = `🚫 Mot interdit : ${found}`;
  }

  if (!violated) return;

  // Supprimer le message
  msg.delete().catch(()=>{});

  // Warn automatique
  if (!db.warns[msg.author.id]) db.warns[msg.author.id] = [];
  db.warns[msg.author.id].push({ reason:`[AUTO-MOD] ${violated}`, modId:'AutoMod', date:new Date().toLocaleString('fr-FR') });
  const total = db.warns[msg.author.id].length;

  // Avertir le membre
  if (cfg.dm) {
    msg.author.send({ embeds:[new EmbedBuilder().setTitle('⚠️ Avertissement automatique').setDescription(`**Raison :** ${violated}\n**Serveur :** ${msg.guild.name}\n**Total warns :** ${total}`).setColor(C('#f0b429')).setTimestamp()] }).catch(()=>{});
  }

  // Message dans le salon
  const warn = await msg.channel.send({ embeds:[new EmbedBuilder().setDescription(`⚠️ ${msg.author} — ${violated}`).setColor(C('#f0b429'))] });
  setTimeout(() => warn.delete().catch(()=>{}), 5000);

  // Auto-sanction
  if (cfg.autosanction && total >= 3) {
    msg.member?.timeout(10*60000, `Auto-mod: 3 warns`).catch(()=>{});
    msg.channel.send({ embeds:[new EmbedBuilder().setDescription(`🔇 ${msg.author} mis en sourdine automatiquement (3 warns).`).setColor(C('#ff4d4d'))] });
  }

  // Log
  if (CH_LOGS) {
    const ch = msg.guild.channels.cache.get(CH_LOGS);
    if (ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🤖 Auto-Mod').setColor(C('#f0b429')).addFields({name:'Membre',value:`${msg.author} (${msg.author.id})`},{name:'Infraction',value:violated},{name:'Message',value:msg.content.substring(0,200)||'[vide]'},{name:'Total warns',value:`${total}`}).setTimestamp()] });
  }
}

// ─── CODE CUSTOM RUNNER ──────────────────────────────────────
async function runCustomCode(code, interaction) {
  try {
    const fn = new Function(
      'interaction','guild','user','db','EmbedBuilder','ActionRowBuilder',
      'ButtonBuilder','ButtonStyle','addPts','addXP','getUser','C',
      `return (async () => { ${code} })()`
    );
    await fn(interaction,interaction.guild,interaction.user,db,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,addPts,addXP,getUser,C);
    return { ok:true };
  } catch(e) {
    log(`❌ Code custom error: ${e.message}`);
    return { ok:false, error:e.message };
  }
}

// ─── COMMANDES SLASH ─────────────────────────────────────────
const COMMANDS = [
  new SlashCommandBuilder().setName('setup-stats-serveur').setDescription('📊 Créer les salons vocaux de statistiques').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o=>o.setName('nom_categorie').setDescription('Nom de la catégorie (défaut: 📊 STATISTIQUES)'))
    .addBooleanOption(o=>o.setName('membres').setDescription('👥 Compteur membres total (défaut: oui)'))
    .addBooleanOption(o=>o.setName('humains').setDescription('👤 Compteur humains (défaut: oui)'))
    .addBooleanOption(o=>o.setName('bots').setDescription('🤖 Compteur bots (défaut: oui)'))
    .addBooleanOption(o=>o.setName('enligne').setDescription('🟢 Compteur membres en ligne (défaut: oui)'))
    .addBooleanOption(o=>o.setName('vocal').setDescription('🎤 Compteur membres en vocal (défaut: oui)'))
    .addBooleanOption(o=>o.setName('tickets').setDescription('🎫 Compteur tickets ouverts (défaut: non)'))
    .addBooleanOption(o=>o.setName('articles').setDescription('📦 Compteur articles boutique (défaut: non)')),
  new SlashCommandBuilder().setName('supprimer-stats-serveur').setDescription('🗑️ Supprimer les salons stats').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('stats-serveur').setDescription('📊 Stats visuelles complètes (membres, vocal, bots...)'),
  new SlashCommandBuilder().setName('vocal-live').setDescription('🔴 Voir qui est en vocal maintenant'),
  new SlashCommandBuilder().setName('setup-tickets').setDescription('🎫 Installer le panel tickets').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Salon où installer le panel').setRequired(true)),
  new SlashCommandBuilder().setName('ajouter-categorie').setDescription('➕ Ajouter une catégorie de ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('id').setDescription('ID unique (ex: vip)').setRequired(true))
    .addStringOption(o=>o.setName('label').setDescription('Nom (ex: 👑 VIP)').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Description').setRequired(true))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex')),
  // Général
  new SlashCommandBuilder().setName('ping').setDescription('🏓 Latence du bot'),
  new SlashCommandBuilder().setName('aide').setDescription('📋 Liste des commandes'),
  new SlashCommandBuilder().setName('info').setDescription('ℹ️ Informations serveur'),
  new SlashCommandBuilder().setName('stats').setDescription('📊 Statistiques serveur'),
  new SlashCommandBuilder().setName('profil').setDescription('👤 Profil d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Avatar d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('banniere').setDescription('🖼️ Bannière d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('rapport').setDescription('📑 Rapport complet').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Boutique
  new SlashCommandBuilder().setName('shop').setDescription('🛒 Affiche la boutique'),
  new SlashCommandBuilder().setName('article').setDescription('🛒 Détails d\'un article').addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)),
  new SlashCommandBuilder().setName('ajouter-article').setDescription('🛒 Ajouter un article').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true))
    .addStringOption(o=>o.setName('prix').setDescription('Prix').setRequired(true))
    .addStringOption(o=>o.setName('lien').setDescription('Lien').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Description'))
    .addStringOption(o=>o.setName('emoji').setDescription('Emoji'))
    .addIntegerOption(o=>o.setName('stock').setDescription('Stock (-1=illimité)'))
    .addStringOption(o=>o.setName('image').setDescription('URL image')),
  new SlashCommandBuilder().setName('supprimer-article').setDescription('🗑️ Supprimer un article').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)),
  new SlashCommandBuilder().setName('liste-articles').setDescription('📋 Liste des articles'),
  new SlashCommandBuilder().setName('publier-shop').setDescription('📤 Publier la boutique').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Channel'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone/@here')),
  new SlashCommandBuilder().setName('ma-boutique').setDescription('🛒 Boutique complète avec boutons').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Channel'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone/@here')),
  new SlashCommandBuilder().setName('paiements').setDescription('💳 Moyens de paiement'),
  new SlashCommandBuilder().setName('contact').setDescription('📧 Informations de contact'),

  // Modération
  new SlashCommandBuilder().setName('warn').setDescription('⚠️ Avertir un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)),
  new SlashCommandBuilder().setName('warns').setDescription('📋 Voir les warns').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('clearwarns').setDescription('🗑️ Effacer les warns').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('sanctions').setDescription('📋 Historique sanctions').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('👢 Expulser').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o=>o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('ban').setDescription('🔨 Bannir').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o=>o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('unban').setDescription('🔓 Débannir').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o=>o.setName('userid').setDescription('ID utilisateur').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('🔇 Mettre en sourdine').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Durée en minutes').setMinValue(1).setMaxValue(40320))
    .addStringOption(o=>o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('unmute').setDescription('🔊 Enlever sourdine').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('🗑️ Supprimer des messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName('nombre').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('lock').setDescription('🔒 Verrouiller le salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('🔓 Déverrouiller le salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('slowmode').setDescription('🐌 Slow mode').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(o=>o.setName('secondes').setDescription('Secondes (0=off)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  new SlashCommandBuilder().setName('automod').setDescription('⚙️ Config auto-modération').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption(o=>o.setName('antispam').setDescription('Anti-spam'))
    .addBooleanOption(o=>o.setName('antilink').setDescription('Anti-lien'))
    .addBooleanOption(o=>o.setName('anticaps').setDescription('Anti-majuscules')),
  new SlashCommandBuilder().setName('mot-interdit').setDescription('🚫 Gérer les mots bannis').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('action').setDescription('add/remove/list').setRequired(true).addChoices({name:'Ajouter',value:'add'},{name:'Retirer',value:'remove'},{name:'Liste',value:'list'}))
    .addStringOption(o=>o.setName('mot').setDescription('Le mot')),

  // Tickets
  new SlashCommandBuilder().setName('ticket').setDescription('🎫 Ouvrir un ticket'),
  new SlashCommandBuilder().setName('fermer').setDescription('🔒 Fermer le ticket'),
  new SlashCommandBuilder().setName('add').setDescription('➕ Ajouter au ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('retirer').setDescription('➖ Retirer du ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),

  // Économie & Niveaux
  new SlashCommandBuilder().setName('points').setDescription('💰 Voir vos points').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('niveau').setDescription('⭐ Voir votre niveau').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('daily').setDescription('🎁 Points quotidiens'),
  new SlashCommandBuilder().setName('classement').setDescription('🏆 Top 10 membres'),
  new SlashCommandBuilder().setName('classement-xp').setDescription('⭐ Top 10 XP'),
  new SlashCommandBuilder().setName('donner-points').setDescription('💸 Donner des points').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('retirer-points').setDescription('💸 Retirer des points').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('shop-roles').setDescription('🛍️ Boutique de rôles'),
  new SlashCommandBuilder().setName('acheter-role').setDescription('🛍️ Acheter un rôle avec ses points')
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('ajouter-role-shop').setDescription('🛍️ Mettre un rôle en vente').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true))
    .addIntegerOption(o=>o.setName('prix').setDescription('Prix en points').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('role-niveau').setDescription('🎭 Rôle automatique par niveau').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(o=>o.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1))
    .addRoleOption(o=>o.setName('role').setDescription('Rôle à attribuer').setRequired(true)),

  // Réputation
  new SlashCommandBuilder().setName('rep').setDescription('⭐ Donner de la réputation').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('ma-rep').setDescription('⭐ Voir ma réputation').addUserOption(o=>o.setName('membre').setDescription('Membre')),

  // Giveaway
  new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Créer un giveaway').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('prix').setDescription('Prix').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('giveaway-fin').setDescription('🏁 Terminer un giveaway').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),
  new SlashCommandBuilder().setName('giveaway-reroll').setDescription('🔄 Nouveau gagnant').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),

  // Sondages
  new SlashCommandBuilder().setName('sondage').setDescription('📊 Créer un sondage').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('question').setDescription('Question').setRequired(true))
    .addStringOption(o=>o.setName('options').setDescription('Options séparées par |').setRequired(true)),
  new SlashCommandBuilder().setName('resultats').setDescription('📊 Résultats d\'un sondage')
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),

  // Rôles
  new SlashCommandBuilder().setName('reaction-role').setDescription('🎭 Créer des reaction roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o=>o.setName('paires').setDescription('emoji:roleID séparés par |').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('donner-role').setDescription('🎭 Donner un rôle').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('retirer-role').setDescription('🎭 Retirer un rôle').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)),

  // Annonces & Messages
  new SlashCommandBuilder().setName('annonce').setDescription('📢 Envoyer une annonce embed').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o=>o.setName('message').setDescription('Contenu').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone/@here'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex'))
    .addStringOption(o=>o.setName('image').setDescription('URL image')),
  new SlashCommandBuilder().setName('message-perso').setDescription('💬 Envoyer un message simple').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('contenu').setDescription('Contenu').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('boutons').setDescription('🔘 Embed avec boutons liens').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o=>o.setName('btn1').setDescription('Bouton 1 : texte|lien').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Description'))
    .addStringOption(o=>o.setName('btn2').setDescription('Bouton 2'))
    .addStringOption(o=>o.setName('btn3').setDescription('Bouton 3'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex'))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone/@here')),
  new SlashCommandBuilder().setName('sticky').setDescription('📌 Message sticky dans ce salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o=>o.setName('message').setDescription('Message (vide=désactiver)')),
  new SlashCommandBuilder().setName('epingler').setDescription('📌 Épingler un message').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),

  // Setup
  new SlashCommandBuilder().setName('generer-regles').setDescription('📜 Générer des règles').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('type').setDescription('Type de serveur').setRequired(true).addChoices({name:'🛒 Vente',value:'vente'},{name:'🎮 Gaming',value:'gaming'},{name:'💬 Communauté',value:'communaute'}))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel cible')),
  new SlashCommandBuilder().setName('setup-salon').setDescription('⚙️ Créer un salon pré-configuré').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices(
      {name:'🛒 Boutique',value:'shop'},{name:'📜 Règles',value:'rules'},
      {name:'👋 Bienvenue',value:'welcome'},{name:'🎫 Tickets',value:'tickets'},
      {name:'📢 Annonces',value:'annonces'},{name:'💬 Général',value:'general'},
      {name:'🏆 Classement',value:'classement'},{name:'📊 Stats vocaux',value:'vocaux'}
    )),
  new SlashCommandBuilder().setName('setup-serveur').setDescription('🚀 Configurer le serveur complet').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({name:'🛒 Vente',value:'vente'},{name:'🎮 Gaming',value:'gaming'},{name:'💬 Communauté',value:'communaute'})),

  // Fun & Utilitaires
  new SlashCommandBuilder().setName('blague').setDescription('😂 Blague aléatoire'),
  new SlashCommandBuilder().setName('pile-ou-face').setDescription('🪙 Pile ou face'),
  new SlashCommandBuilder().setName('des').setDescription('🎲 Lancer un dé').addIntegerOption(o=>o.setName('faces').setDescription('Nombre de faces (défaut: 6)').setMinValue(2).setMaxValue(100)),
  new SlashCommandBuilder().setName('choisir').setDescription('🎯 Choisir parmi des options').addStringOption(o=>o.setName('options').setDescription('Options séparées par |').setRequired(true)),
  new SlashCommandBuilder().setName('citation').setDescription('💬 Citation inspirante aléatoire'),
  new SlashCommandBuilder().setName('8ball').setDescription('🎱 Poser une question à la boule magique').addStringOption(o=>o.setName('question').setDescription('Ta question').setRequired(true)),
  new SlashCommandBuilder().setName('compter').setDescription('🔢 Compter les membres par statut'),
  new SlashCommandBuilder().setName('rappel').setDescription('⏰ Créer un rappel')
    .addIntegerOption(o=>o.setName('minutes').setDescription('Dans combien de minutes').setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption(o=>o.setName('message').setDescription('Message du rappel').setRequired(true)),

  // Anniversaires
  new SlashCommandBuilder().setName('anniversaire').setDescription('🎂 Définir son anniversaire')
    .addStringOption(o=>o.setName('date').setDescription('Date (JJ/MM)').setRequired(true)),
  new SlashCommandBuilder().setName('prochains-anniversaires').setDescription('🎂 Voir les prochains anniversaires'),

  // Stats vocaux
  new SlashCommandBuilder().setName('stats-vocaux').setDescription('🎤 Voir les stats vocaux').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('classement-vocal').setDescription('🎤 Classement temps vocal'),
  new SlashCommandBuilder().setName('vocal-live').setDescription('🔴 Voir qui est en vocal maintenant'),

  // Commandes custom
  new SlashCommandBuilder().setName('cmd').setDescription('▶️ Utiliser une commande personnalisée')
    .addStringOption(o=>o.setName('nom').setDescription('Nom de la commande').setRequired(true)),
  new SlashCommandBuilder().setName('cmd-liste').setDescription('📋 Liste des commandes personnalisées'),

  // Candidatures
  new SlashCommandBuilder().setName('postuler').setDescription('📝 Postuler dans l\'équipe'),
  new SlashCommandBuilder().setName('candidatures').setDescription('📋 Voir les candidatures').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Config
  new SlashCommandBuilder().setName('config-shop').setDescription('⚙️ Configurer la boutique').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex'))
    .addStringOption(o=>o.setName('footer').setDescription('Footer')),
  new SlashCommandBuilder().setName('macommande').setDescription('📦 Suivre le statut de ta commande')
    .addStringOption(o=>o.setName('id').setDescription('ID de ta commande (ex: CMD-001)').setRequired(true)),
  new SlashCommandBuilder().setName('commandes').setDescription('📋 Voir toutes tes commandes'),
  new SlashCommandBuilder().setName('config-bienvenue').setDescription('⚙️ Configurer le message de bienvenue').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('message').setDescription('Message ({user},{server},{count})'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex')),
  new SlashCommandBuilder().setName('regles').setDescription('📜 Afficher les règles'),

  // ── MEE6 / Draftbot manquants ────────────────────────────────
  // Modération avancée
  new SlashCommandBuilder().setName('tempban').setDescription('⏳ Bannir temporairement').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(525600))
    .addStringOption(o=>o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('tempmute').setDescription('⏳ Mettre en sourdine temporairement').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Durée').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o=>o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('infractions').setDescription('📋 Voir toutes les infractions d\'un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('purge-bots').setDescription('🤖 Supprimer les messages de bots').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName('nombre').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('purge-user').setDescription('👤 Supprimer messages d\'un membre').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('nombre').setDescription('Nombre (1-100)').setMinValue(1).setMaxValue(100)),

  // Infos
  new SlashCommandBuilder().setName('userinfo').setDescription('👤 Infos détaillées sur un membre').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('serverinfo').setDescription('🏠 Infos complètes du serveur'),
  new SlashCommandBuilder().setName('roleinfo').setDescription('🎭 Infos sur un rôle').addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('channelinfo').setDescription('# Infos sur un salon').addChannelOption(o=>o.setName('salon').setDescription('Salon')),
  new SlashCommandBuilder().setName('botinfo').setDescription('🤖 Infos sur le bot'),

  // Niveau avancé
  new SlashCommandBuilder().setName('xp-reset').setDescription('🔄 Réinitialiser le niveau d\'un membre').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('xp-set').setDescription('🔧 Définir les XP d\'un membre').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('niveau').setDescription('Niveau').setRequired(true).setMinValue(1).setMaxValue(999)),
  new SlashCommandBuilder().setName('xp-add').setDescription('➕ Ajouter des XP à un membre').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('xp').setDescription('Quantité XP').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('niveaux').setDescription('⭐ Voir les rôles de niveaux configurés'),

  // Auto-rôle
  new SlashCommandBuilder().setName('autorole').setDescription('🎭 Gérer les auto-rôles').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o=>o.setName('action').setDescription('add/remove/list').setRequired(true).addChoices({name:'Ajouter',value:'add'},{name:'Retirer',value:'remove'},{name:'Liste',value:'list'}))
    .addRoleOption(o=>o.setName('role').setDescription('Rôle')),

  // Économie avancée
  new SlashCommandBuilder().setName('transferer').setDescription('💸 Transférer des points à un membre')
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('travailler').setDescription('💼 Travailler pour gagner des points (cooldown 1h)'),
  new SlashCommandBuilder().setName('crime').setDescription('🔫 Commettre un crime (risque & gain)'),
  new SlashCommandBuilder().setName('pari').setDescription('🎰 Parier des points')
    .addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(10)),
  new SlashCommandBuilder().setName('inventaire').setDescription('🎒 Voir votre inventaire'),
  new SlashCommandBuilder().setName('reset-eco').setDescription('🔄 Réinitialiser l\'économie d\'un membre').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),

  // Musique (simulée car sans libs audio)
  new SlashCommandBuilder().setName('musique').setDescription('🎵 Commandes musique (info)'),

  // Utilitaires avancés
  new SlashCommandBuilder().setName('embed').setDescription('📝 Créer un embed personnalisé complet').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Description').setRequired(true))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex'))
    .addStringOption(o=>o.setName('image').setDescription('URL image'))
    .addStringOption(o=>o.setName('thumbnail').setDescription('URL thumbnail'))
    .addStringOption(o=>o.setName('footer').setDescription('Footer'))
    .addChannelOption(o=>o.setName('channel').setDescription('Salon cible'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone/@here')),
  new SlashCommandBuilder().setName('say').setDescription('💬 Faire parler le bot').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o=>o.setName('message').setDescription('Message').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Salon')),
  new SlashCommandBuilder().setName('calcul').setDescription('🔢 Calculatrice')
    .addStringOption(o=>o.setName('expression').setDescription('Expression mathématique').setRequired(true)),
  new SlashCommandBuilder().setName('timer').setDescription('⏱️ Lancer un compte à rebours').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(o=>o.setName('minutes').setDescription('Minutes').setRequired(true).setMinValue(1))
    .addStringOption(o=>o.setName('titre').setDescription('Titre'))
    .addChannelOption(o=>o.setName('channel').setDescription('Salon')),
  new SlashCommandBuilder().setName('vote').setDescription('👍 Créer un vote simple oui/non').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('question').setDescription('Question').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Salon')),
  new SlashCommandBuilder().setName('convert').setDescription('💱 Convertir des devises')
    .addNumberOption(o=>o.setName('montant').setDescription('Montant').setRequired(true))
    .addStringOption(o=>o.setName('de').setDescription('Devise source (EUR, USD, GBP...)').setRequired(true))
    .addStringOption(o=>o.setName('vers').setDescription('Devise cible').setRequired(true)),
  new SlashCommandBuilder().setName('color').setDescription('🎨 Infos sur une couleur hex')
    .addStringOption(o=>o.setName('hex').setDescription('Code couleur hex (ex: #5865F2)').setRequired(true)),

  // Tickets avancés
  new SlashCommandBuilder().setName('ticket-rename').setDescription('✏️ Renommer ce ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o=>o.setName('nom').setDescription('Nouveau nom').setRequired(true)),
  new SlashCommandBuilder().setName('ticket-info').setDescription('ℹ️ Infos sur ce ticket'),
  new SlashCommandBuilder().setName('mes-tickets').setDescription('🎫 Voir mes tickets passés'),
].map(c => c.toJSON());

// ─── CLIENT ──────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildModeration,
  ],
  partials:[Partials.Message,Partials.Channel,Partials.GuildMember,Partials.Reaction],
});

async function register() {
  const rest = new REST({ version:'10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{ body:COMMANDS });
    log(`✅ ${COMMANDS.length} commandes enregistrées`);
  } catch(e) { log(`❌ Register: ${e.message}`); }
}

// ─── EVENTS ──────────────────────────────────────────────────

client.once(Events.ClientReady, async () => {
  log(`✅ ${client.user.tag} connecté`);
  client.user.setActivity('🛒 /shop | /aide | Panel Admin', { type:ActivityType.Watching });
  await register();
  if (SH_KEY) {
    try {
      const r = await fetch('https://dash.sellhub.cx/api/sellhub/products',{headers:{Authorization:SH_KEY}});
      const d = await r.json();
      db.sellhubProducts = d.data||d.products||(Array.isArray(d)?d:[]);
      log(`🛒 ${db.sellhubProducts.length} produits Sellhub`);
    } catch(e) { log(`⚠️ Sellhub: ${e.message}`); }
  }
  // Stats channels — mise à jour toutes les 10 minutes
  setInterval(async () => {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) await updateStatsChannels(guild);
  }, 10 * 60 * 1000);

  // ── AUTO-SAVE DB toutes les 10 minutes ───────────────────────
  const DB_SAVE_FILE = path.join(__dirname, 'nexusbot_db_backup.json');
  const fs = require('fs');
  setInterval(() => {
    try {
      fs.writeFileSync(DB_SAVE_FILE, JSON.stringify(db, null, 2), 'utf-8');
      log('💾 DB auto-sauvegardée');
    } catch(e) { log(`⚠️ Échec sauvegarde DB: ${e.message}`); }
  }, 10 * 60 * 1000);

  // Charger la DB depuis le fichier de backup au démarrage
  try {
    if (fs.existsSync(DB_SAVE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DB_SAVE_FILE, 'utf-8'));
      // Fusionner les données sauvegardées (sans écraser les structures par défaut)
      const mergeKeys = ['economy','warns','tickets','ticketMap','ticketCategories','articles','giveaways','birthdays','voiceStats','rep','customCmds','modConfig','statsChannels','welcomeConfig','autoRoles','levelRoles','db_version'];
      mergeKeys.forEach(k => { if (saved[k] !== undefined) db[k] = saved[k]; });
      log(`✅ DB restaurée depuis backup (${db.articles.length} articles, ${Object.keys(db.economy).length} joueurs)`);
    }
  } catch(e) { log(`⚠️ Impossible de lire le backup DB: ${e.message}`); }

  // ── SYNC NEXUSSTORE toutes les 10 minutes ────────────────────
  setInterval(async () => {
    const nsWorker = process.env.NEXUSSTORE_WORKER_URL || '';
    const nsKey    = process.env.NEXUSSTORE_API_KEY    || '';
    if (!nsWorker || !db.articles.length) return;
    try {
      const payload = db.articles.map(a => ({
        id: a.id, name: a.name, price: a.price,
        description: a.description, emoji: a.emoji,
        stock: a.stock, image: a.image, link: a.link,
        category: a.category, visible: a.stock !== 0,
      }));
      const r = await fetch(nsWorker.replace(/\/$/, '') + '/sync-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': nsKey },
        body: JSON.stringify({ products: payload }),
      });
      if (r.ok) log(`🌐 NexusStore sync: ${payload.length} articles synchronisés`);
      else log(`⚠️ NexusStore sync error: ${r.status}`);
    } catch(e) { log(`⚠️ NexusStore sync: ${e.message}`); }
  }, 10 * 60 * 1000);

  // Giveaways timer
  setInterval(() => {
    Object.entries(db.giveaways).forEach(([id,gw]) => {
      if (!gw.ended && gw.end <= Date.now()) {
        const g = client.guilds.cache.get(GUILD_ID);
        if (g) endGiveaway(id,g);
      }
    });
  }, 10000);
  // Rappels timer
  setInterval(async () => {
    const now = Date.now();
    const due = db.reminders.filter(r => r.time <= now);
    for (const r of due) {
      try {
        const ch = client.channels.cache.get(r.channelId);
        if (ch) ch.send({ content:`⏰ <@${r.userId}> — Rappel : **${r.msg}**` });
      } catch(e) {}
    }
    db.reminders = db.reminders.filter(r => r.time > now);
  }, 30000);
  // Anniversaires (check 1x/jour à 9h)
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() !== 9 || now.getMinutes() > 5) return;
    const today = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}`;
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild || !CH_WELCOME) return;
    const ch = guild.channels.cache.get(CH_WELCOME);
    if (!ch) return;
    for (const [userId, date] of Object.entries(db.birthdays)) {
      if (date === today) {
        ch.send({ embeds:[new EmbedBuilder().setTitle('🎂 Joyeux Anniversaire !').setDescription(`C'est l'anniversaire de <@${userId}> aujourd'hui ! 🥳\nTout le serveur te souhaite un excellent anniversaire ! 🎉`).setColor(C('#f0b429')).setTimestamp()] });
        addPts(userId, 100);
      }
    }
  }, 60000);
});

// Membre rejoint
client.on(Events.GuildMemberAdd, async member => {
  addPts(member.id, 10);
  // Auto-rôle
  if (ROLE_MEMBER) { const r=member.guild.roles.cache.get(ROLE_MEMBER); if(r) member.roles.add(r).catch(()=>{}); }
  db.autoRoles.forEach(roleId => { const r=member.guild.roles.cache.get(roleId); if(r) member.roles.add(r).catch(()=>{}); });
  // Message de bienvenue
  const wcfg = db.welcomeConfig;
  if (!wcfg.channelId) return;
  const ch = member.guild.channels.cache.get(wcfg.channelId);
  if (!ch) return;
  const text = wcfg.message
    .replace('{user}', member.toString())
    .replace('{server}', member.guild.name)
    .replace('{count}', member.guild.memberCount.toString())
    .replace('{username}', member.user.username);
  ch.send({ embeds:[new EmbedBuilder().setTitle(`👋 Bienvenue sur ${member.guild.name} !`).setDescription(text).setColor(C(wcfg.color||'#5865F2')).setThumbnail(member.user.displayAvatarURL({dynamic:true})).setTimestamp().setFooter({text:`Membre #${member.guild.memberCount}`})] });
  // Log
  if (CH_LOGS) { const l=member.guild.channels.cache.get(CH_LOGS); if(l) l.send({ embeds:[new EmbedBuilder().setTitle('📥 Membre rejoint').setColor(C('#10d982')).setThumbnail(member.user.displayAvatarURL({dynamic:true})).addFields({name:'Membre',value:`${member.user.tag} (${member.id})`},{name:'Compte créé',value:`<t:${Math.floor(member.user.createdTimestamp/1000)}:R>`},{name:'Total membres',value:`${member.guild.memberCount}`}).setTimestamp()] }); }
  updateStatsChannels(member.guild).catch(()=>{});
});

// Membre part
client.on(Events.GuildMemberRemove, async member => {
  if (CH_BYE) { const ch=member.guild.channels.cache.get(CH_BYE); if(ch) ch.send({ embeds:[new EmbedBuilder().setDescription(`👋 **${member.user.username}** a quitté le serveur.\nIl reste **${member.guild.memberCount}** membres.`).setColor(C('#ff4d4d')).setTimestamp()] }); }
  if (CH_LOGS) { const l=member.guild.channels.cache.get(CH_LOGS); if(l) l.send({ embeds:[new EmbedBuilder().setTitle('📤 Membre parti').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${member.user.tag} (${member.id})`},{name:'Était là depuis',value:`<t:${Math.floor((member.joinedTimestamp||Date.now())/1000)}:R>`}).setTimestamp()] }); }
  updateStatsChannels(member.guild).catch(()=>{});
});

// Messages
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot || !msg.guild) return;

  // Auto-mod
  const member = msg.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await autoMod(msg);
  }

  // XP & points
  const u = getUser(msg.author.id);
  if (Date.now()-u.lastMsg > 60000) {
    u.lastMsg = Date.now();
    const levelUp = addXP(msg.author.id, Math.floor(Math.random()*5)+1);
    addPts(msg.author.id, 1);
    if (levelUp) {
      msg.channel.send({ embeds:[new EmbedBuilder().setTitle('⭐ Level Up !').setDescription(`Félicitations ${msg.author} ! Tu es maintenant **niveau ${u.level}** ! 🎉`).setColor(C('#f0b429')).setThumbnail(msg.author.displayAvatarURL({dynamic:true})).setTimestamp()] }).catch(()=>{});
      addPts(msg.author.id, u.level*10);
      // Rôles de niveau
      const roleReward = db.levelRoles.find(lr => lr.level === u.level);
      if (roleReward) {
        const role = msg.guild.roles.cache.get(roleReward.roleId);
        if (role) member?.roles.add(role).catch(()=>{});
      }
    }
  }

  // Sticky messages
  if (db.sticky[msg.channel.id]) {
    const sticky = db.sticky[msg.channel.id];
    try {
      const old = await msg.channel.messages.fetch(sticky.msgId).catch(()=>null);
      if (old) old.delete().catch(()=>{});
    } catch(e) {}
    const newMsg = await msg.channel.send({ embeds:[new EmbedBuilder().setDescription(`📌 **Message épinglé**\n\n${sticky.content}`).setColor(C('#5865F2'))] });
    sticky.msgId = newMsg.id;
  }

  // Setup tickets par message
  if (msg.content === '!setup-tickets' && member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('t_open_cmd').setLabel('📦 Commande').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('t_open_sup').setLabel('🔧 Support').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('t_open_q').setLabel('❓ Question').setStyle(ButtonStyle.Success)
    );
    msg.channel.send({ embeds:[new EmbedBuilder().setTitle('🎫 Centre de Support').setDescription('Choisissez la catégorie de votre ticket :').setColor(C('#5865F2')).setTimestamp()], components:[row] });
    msg.delete().catch(()=>{});
  }
});

// Messages modifiés
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (!oldMsg.guild || oldMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  if (!CH_LOGS) return;
  const ch = oldMsg.guild.channels.cache.get(CH_LOGS);
  if (!ch) return;
  ch.send({ embeds:[new EmbedBuilder().setTitle('✏️ Message modifié').setColor(C('#4d8fff')).addFields(
    {name:'Membre',value:`${oldMsg.author} (${oldMsg.author?.id})`},
    {name:'Salon',value:`<#${oldMsg.channel.id}>`},
    {name:'Avant',value:oldMsg.content?.substring(0,500)||'[inconnu]'},
    {name:'Après',value:newMsg.content?.substring(0,500)||'[inconnu]'},
    {name:'Lien',value:`[Aller au message](${newMsg.url})`}
  ).setTimestamp()] });
});

// Messages supprimés
client.on(Events.MessageDelete, async msg => {
  if (!msg.guild || msg.author?.bot) return;
  if (!CH_LOGS) return;
  const ch = msg.guild.channels.cache.get(CH_LOGS);
  if (!ch) return;
  ch.send({ embeds:[new EmbedBuilder().setTitle('🗑️ Message supprimé').setColor(C('#ff4d4d')).addFields(
    {name:'Membre',value:`${msg.author||'Inconnu'} (${msg.author?.id||'?'})`},
    {name:'Salon',value:`<#${msg.channel.id}>`},
    {name:'Contenu',value:msg.content?.substring(0,500)||'[embed/fichier]'},
  ).setTimestamp()] });
});

// ─── STATS VOCAUX ─────────────────────────────────────────────
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const userId = newState.member?.id || oldState.member?.id;
  if (!userId || newState.member?.user.bot) return;

  // Rejoint un vocal
  if (!oldState.channel && newState.channel) {
    db.voiceActive[userId] = newState.channel.id;
    if (!db.voiceStats[userId]) db.voiceStats[userId] = { totalMinutes:0, sessions:0, lastJoin:0 };
    db.voiceStats[userId].lastJoin = Date.now();
    db.voiceStats[userId].sessions++;
    // Log
    if (CH_LOGS) { const ch=newState.guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🔊 Rejoint un vocal').setColor(C('#10d982')).addFields({name:'Membre',value:`${newState.member} (${userId})`},{name:'Salon',value:`${newState.channel.name}`}).setTimestamp()] }); }
  }

  // Quitte un vocal
  if (oldState.channel && !newState.channel) {
    delete db.voiceActive[userId];
    if (db.voiceStats[userId]?.lastJoin) {
      const minutes = Math.floor((Date.now()-db.voiceStats[userId].lastJoin)/60000);
      db.voiceStats[userId].totalMinutes += minutes;
      addPts(userId, Math.floor(minutes/5)); // 1 point toutes les 5 min
    }
    // Log
    if (CH_LOGS) { const ch=oldState.guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🔇 Quitté un vocal').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${oldState.member} (${userId})`},{name:'Salon',value:`${oldState.channel.name}`}).setTimestamp()] }); }
  }

  // Change de salon
  if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    db.voiceActive[userId] = newState.channel.id;
    if (CH_LOGS) { const ch=newState.guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🔀 Changement de vocal').setColor(C('#4d8fff')).addFields({name:'Membre',value:`${newState.member}`},{name:'Avant',value:oldState.channel.name},{name:'Après',value:newState.channel.name}).setTimestamp()] }); }
  }
});

// Réactions
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(()=>{});
  const msgId = reaction.message.id;
  if (db.giveaways[msgId]?.entries) db.giveaways[msgId].entries.add(user.id);
  const rr = db.reactionRoles[msgId];
  if (rr) {
    const roleId = rr[reaction.emoji.name]||rr[reaction.emoji.toString()];
    if (roleId) {
      const m = await reaction.message.guild?.members.fetch(user.id).catch(()=>null);
      const r = reaction.message.guild?.roles.cache.get(roleId);
      if (m&&r) m.roles.add(r).catch(()=>{});
    }
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(()=>{});
  const msgId = reaction.message.id;
  if (db.giveaways[msgId]?.entries) db.giveaways[msgId].entries.delete(user.id);
  const rr = db.reactionRoles[msgId];
  if (rr) {
    const roleId = rr[reaction.emoji.name]||rr[reaction.emoji.toString()];
    if (roleId) {
      const m = await reaction.message.guild?.members.fetch(user.id).catch(()=>null);
      const r = reaction.message.guild?.roles.cache.get(roleId);
      if (m&&r) m.roles.remove(r).catch(()=>{});
    }
  }
});

// ─── INTERACTIONS ─────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {

  // ══ SELECT MENU ══ (tickets multi-catégories)
  if (interaction.isStringSelectMenu() && interaction.customId==='ticket_category') {
    const categoryId = interaction.values[0];
    await interaction.deferReply({ ephemeral:true });
    try {
      const r = await openTicket(interaction.guild, interaction.user, categoryId);
      if (r.already) return interaction.editReply({ content:`❌ Ticket déjà ouvert : <#${r.channel.id}>` });
      return interaction.editReply({ content:`✅ Ticket créé : <#${r.channel.id}>` });
    } catch(e) { return interaction.editReply({ content:`❌ ${e.message}` }); }
  }

  // ══ BOUTONS ══
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id.startsWith('t_open_')) {
      const cat = id==='t_open_cmd'?'Commande':id==='t_open_sup'?'Support':'Question';
      await interaction.deferReply({ ephemeral:true });
      try {
        const r = await openTicket(interaction.guild, interaction.user, cat);
        if (r.already) return interaction.editReply({ content:`❌ Ticket existant : <#${r.channel.id}>` });
        return interaction.editReply({ content:`✅ Ticket créé : <#${r.channel.id}>` });
      } catch(e) { return interaction.editReply({ content:`❌ ${e.message}` }); }
    }
    if (id==='t_close') {
      if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ content:'❌', ephemeral:true });
      await interaction.reply({ content:'🔒 Fermeture dans 5s...' });
      return closeTicket(interaction.channel, interaction.user);
    }
    if (id==='t_claim') return interaction.reply({ content:`✋ **${interaction.user.username}** prend en charge ce ticket.` });
    if (id==='t_transcript') {
      await interaction.deferReply({ ephemeral:true });
      const msgs = await interaction.channel.messages.fetch({ limit:100 });
      const txt  = [...msgs.values()].reverse().map(m=>`[${new Date(m.createdTimestamp).toLocaleString('fr-FR')}] ${m.author.username}: ${m.content||'[embed]'}`).join('\n');
      return interaction.editReply({ files:[{attachment:Buffer.from(txt,'utf-8'),name:`transcript-${interaction.channel.name}.txt`}] });
    }
    if (id==='gw_join') {
      const gw = db.giveaways[interaction.message.id];
      if (!gw||gw.ended) return interaction.reply({ content:'❌ Giveaway terminé.', ephemeral:true });
      if (gw.entries.has(interaction.user.id)) { gw.entries.delete(interaction.user.id); return interaction.reply({ content:`😔 Retiré. Participants : **${gw.entries.size}**`, ephemeral:true }); }
      gw.entries.add(interaction.user.id);
      return interaction.reply({ content:`🎉 Tu participes ! Participants : **${gw.entries.size}**`, ephemeral:true });
    }
    if (id.startsWith('app_ok_')||id.startsWith('app_no_')) {
      const idx = parseInt(id.split('_')[2]);
      const app = db.applications[idx];
      if (!app) return interaction.reply({ content:'❌', ephemeral:true });
      const ok = id.startsWith('app_ok_');
      app.status = ok?'acceptée':'refusée';
      const u = await client.users.fetch(app.userId).catch(()=>null);
      if (u) u.send({ embeds:[new EmbedBuilder().setTitle(ok?'✅ Candidature Acceptée !':'❌ Candidature Refusée').setDescription(ok?`Félicitations ! Bienvenue dans l'équipe de **${interaction.guild.name}** !`:`Ta candidature sur **${interaction.guild.name}** n'a pas été retenue.`).setColor(C(ok?'#10d982':'#ff4d4d')).setTimestamp()] }).catch(()=>{});
      await interaction.update({ components:[] });
      return interaction.followUp({ content:`${ok?'✅ Accepté':'❌ Refusé'} : **${app.username}**`, ephemeral:true });
    }
    return;
  }

  // ══ MODALS ══
  if (interaction.isModalSubmit() && interaction.customId==='app_modal') {
    const answers = ['app_q1','app_q2','app_q3'].map(q=>interaction.fields.getTextInputValue(q));
    const app = { userId:interaction.user.id, username:interaction.user.username, answers, date:new Date().toLocaleString('fr-FR'), status:'en attente' };
    db.applications.push(app);
    const idx = db.applications.length-1;
    await interaction.reply({ embeds:[OK('Candidature envoyée !','Ta candidature a bien été reçue.')], ephemeral:true });
    if (CH_LOGS) {
      const ch = interaction.guild.channels.cache.get(CH_LOGS);
      if (ch) ch.send({
        embeds:[new EmbedBuilder().setTitle('📝 Nouvelle Candidature').setColor(C('#f0b429')).setThumbnail(interaction.user.displayAvatarURL({dynamic:true})).addFields({name:'👤 Candidat',value:`${interaction.user}`},{name:'❓ Motivation',value:answers[0]},{name:'🎯 Expérience',value:answers[1]},{name:'📅 Dispo',value:answers[2]}).setTimestamp()],
        components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`app_ok_${idx}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`app_no_${idx}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger))]
      });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  // ══ COMMANDES CUSTOM PANEL ══
  if (cmd==='cmd') {
    const nom = interaction.options.getString('nom').toLowerCase().replace(/\s+/g,'-');
    const c   = db.customCmds[nom];
    if (!c) return interaction.reply({ embeds:[ERR(`Commande \`${nom}\` introuvable. Voir \`/cmd-liste\`.`)], ephemeral:true });
    if (c.code&&c.code.trim()) {
      await interaction.deferReply({ ephemeral:c.ephemeral||false });
      const result = await runCustomCode(c.code, interaction);
      if (!result.ok) return interaction.editReply({ embeds:[ERR(`Erreur : \`${result.error}\``)] });
      return;
    }
    if (!c.reponse) return interaction.reply({ embeds:[ERR('Commande sans réponse définie.')], ephemeral:true });
    const text = c.reponse
      .replace('{user}',interaction.user.toString())
      .replace('{server}',interaction.guild.name)
      .replace('{count}',interaction.guild.memberCount.toString())
      .replace('{points}',getUser(interaction.user.id).points.toString());
    if (c.type==='embed') return interaction.reply({ embeds:[new EmbedBuilder().setDescription(text).setColor(C(c.color||'#f0b429')).setTimestamp()] });
    return interaction.reply({ content:text });
  }

  if (cmd==='cmd-liste') {
    const cmds = Object.entries(db.customCmds);
    if (!cmds.length) return interaction.reply({ embeds:[INF('Commandes perso','Aucune. Créez-en depuis le panel admin.')], ephemeral:true });
    const emb = new EmbedBuilder().setTitle(`⚡ Commandes personnalisées (${cmds.length})`).setColor(C('#f0b429')).setTimestamp();
    cmds.forEach(([n,c]) => emb.addFields({ name:`/cmd ${n}`, value:c.desc||c.reponse?.substring(0,60)||'Code custom', inline:false }));
    return interaction.reply({ embeds:[emb] });
  }

  // ══ STATS SERVEUR VISUEL ══
  // ══ SETUP STATS SERVEUR (salons vocaux compteurs) ══
  if (cmd === 'setup-stats-serveur') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const g = interaction.guild;
      await g.members.fetch();

      // Lire les options choisies
      const wantMembers  = interaction.options.getBoolean('membres')  ?? true;
      const wantHumans   = interaction.options.getBoolean('humains')  ?? true;
      const wantBots     = interaction.options.getBoolean('bots')     ?? true;
      const wantOnline   = interaction.options.getBoolean('enligne')  ?? true;
      const wantVoice    = interaction.options.getBoolean('vocal')    ?? true;
      const wantTickets  = interaction.options.getBoolean('tickets')  ?? false;
      const wantArticles = interaction.options.getBoolean('articles') ?? false;
      const catName      = interaction.options.getString('nom_categorie') || '📊 ── STATISTIQUES ──';

      const total   = g.memberCount;
      const humans  = g.members.cache.filter(m => !m.user.bot).size;
      const bots    = g.members.cache.filter(m => m.user.bot).size;
      const online  = g.members.cache.filter(m => !m.user.bot && m.presence?.status && m.presence.status !== 'offline').size;
      const inVoice = Object.keys(db.voiceActive).length;

      // Créer catégorie
      const category = await g.channels.create({
        name: catName,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: g.id, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages] },
        ],
      });

      const makeVC = async (name) => g.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [
          { id: g.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] },
        ],
      });

      const created = {};
      const fields  = [];

      if (wantMembers)  { const ch = await makeVC(`👥 Membres : ${total}`);   created.membersId   = ch.id; fields.push({ name:'👥 Membres total',    value:`<#${ch.id}>`, inline:true }); }
      if (wantHumans)   { const ch = await makeVC(`👤 Humains : ${humans}`);  created.humansId    = ch.id; fields.push({ name:'👤 Humains',          value:`<#${ch.id}>`, inline:true }); }
      if (wantBots)     { const ch = await makeVC(`🤖 Bots : ${bots}`);       created.botsId      = ch.id; fields.push({ name:'🤖 Bots',             value:`<#${ch.id}>`, inline:true }); }
      if (wantOnline)   { const ch = await makeVC(`🟢 En ligne : ${online}`); created.onlineId    = ch.id; fields.push({ name:'🟢 En ligne',         value:`<#${ch.id}>`, inline:true }); }
      if (wantVoice)    { const ch = await makeVC(`🎤 En vocal : ${inVoice}`);created.voiceId     = ch.id; fields.push({ name:'🎤 En vocal',         value:`<#${ch.id}>`, inline:true }); }
      if (wantTickets)  { const ch = await makeVC(`🎫 Tickets : ${Object.keys(db.ticketMap).length}`); created.ticketsId = ch.id; fields.push({ name:'🎫 Tickets',  value:`<#${ch.id}>`, inline:true }); }
      if (wantArticles) { const ch = await makeVC(`📦 Articles : ${db.articles.length}`); created.articlesId = ch.id; fields.push({ name:'📦 Articles', value:`<#${ch.id}>`, inline:true }); }

      db.statsChannels = { ...created, categoryId: category.id };

      log(`📊 Stats channels créés (${fields.length} salons)`);
      return interaction.editReply({ embeds: [new EmbedBuilder()
        .setTitle(`✅ ${fields.length} salon${fields.length>1?'s':''} stats créé${fields.length>1?'s':''}`)
        .setColor(C('#10d982'))
        .setDescription(`La catégorie **${catName}** a été créée avec **${fields.length} compteur${fields.length>1?'s':''}**.\n\n🔄 Mise à jour automatique toutes les **10 minutes**.\n> Les membres ne peuvent pas rejoindre ces salons.`)
        .addFields(...fields)
        .setFooter({ text: 'NexusBot Stats • /supprimer-stats-serveur pour tout effacer' })
        .setTimestamp()
      ] });
    } catch(e) {
      return interaction.editReply({ embeds: [ERR(`Erreur : ${e.message}`)] });
    }
  }

  if (cmd === 'supprimer-stats-serveur') {
    await interaction.deferReply({ ephemeral: true });
    const sc = db.statsChannels;
    const ids = [sc.membersId, sc.humansId, sc.botsId, sc.onlineId, sc.voiceId, sc.ticketsId, sc.articlesId, sc.categoryId].filter(Boolean);
    let deleted = 0;
    for (const id of ids) {
      const ch = interaction.guild.channels.cache.get(id);
      if (ch) { await ch.delete().catch(() => {}); deleted++; }
    }
    db.statsChannels = {};
    return interaction.editReply({ embeds: [OK(`${deleted} salon(s) stats supprimé(s).`, '')] });
  }

  // ══ STATS SERVEUR EMBED ══
  if (cmd==='stats-serveur') {
    await interaction.deferReply();
    const g = interaction.guild;
    await g.members.fetch();
    const total   = g.memberCount;
    const humans  = g.members.cache.filter(m=>!m.user.bot).size;
    const bots    = g.members.cache.filter(m=>m.user.bot).size;
    const online  = g.members.cache.filter(m=>!m.user.bot&&m.presence?.status==='online').size;
    const idle    = g.members.cache.filter(m=>!m.user.bot&&m.presence?.status==='idle').size;
    const dnd     = g.members.cache.filter(m=>!m.user.bot&&m.presence?.status==='dnd').size;
    const offline = humans - online - idle - dnd;
    const inVoice = Object.keys(db.voiceActive).length;
    const textCh  = g.channels.cache.filter(c=>c.type===ChannelType.GuildText).size;
    const voiceCh = g.channels.cache.filter(c=>c.type===ChannelType.GuildVoice).size;
    const totalWarns = Object.values(db.warns).reduce((s,w)=>s+w.length, 0);
    const bar = (v,max,len=12) => { if(!max)return'░'.repeat(len)+' 0%'; const f=Math.max(0,Math.min(len,Math.round((v/max)*len))); return '█'.repeat(f)+'░'.repeat(len-f)+` ${Math.round((v/max)*100)}%`; };
    const topEco = Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,3).map(([id,d],i)=>`${['🥇','🥈','🥉'][i]} <@${id}> **${d.points}pts** Niv.${d.level}`).join('\n')||'Aucun';
    const topVoice = Object.entries(db.voiceStats).sort(([,a],[,b])=>b.totalMinutes-a.totalMinutes).slice(0,3).map(([id,vs],i)=>{const h=Math.floor(vs.totalMinutes/60),m=vs.totalMinutes%60;return`${['🥇','🥈','🥉'][i]} <@${id}> **${h}h${m}m**`;}).join('\n')||'Aucun';
    const voiceChannels = g.channels.cache.filter(c=>c.type===ChannelType.GuildVoice);
    const voiceLines = [];
    voiceChannels.forEach(vc=>{const mbs=vc.members.filter(m=>!m.user.bot);if(!mbs.size)return;voiceLines.push(`🔊 **${vc.name}** (${mbs.size}) — ${mbs.map(m=>m.user.username+(m.voice.selfMute?' 🔇':m.voice.selfDeaf?' 🔕':'')).join(', ')}`);});
    const emb = new EmbedBuilder()
      .setTitle(`📊 Statistiques — ${g.name}`)
      .setThumbnail(g.iconURL({dynamic:true,size:256}))
      .setColor(C('#5865F2'))
      .addFields(
        {name:'━━━━━━━ 👥 MEMBRES ━━━━━━━',value:'\u200b',inline:false},
        {name:'👥 Total',value:`**${total}**`,inline:true},
        {name:'👤 Humains',value:`**${humans}**`,inline:true},
        {name:'🤖 Bots',value:`**${bots}**`,inline:true},
        {name:'━━━━━━ 🟢 STATUTS ━━━━━━━',value:'\u200b',inline:false},
        {name:'🟢 En ligne',value:`**${online}** ${bar(online,humans,10)}`,inline:false},
        {name:'🟡 Absent',value:`**${idle}** ${bar(idle,humans,10)}`,inline:false},
        {name:'🔴 DND',value:`**${dnd}** ${bar(dnd,humans,10)}`,inline:false},
        {name:'⚫ Hors ligne',value:`**${offline}** ${bar(offline,humans,10)}`,inline:false},
        {name:'━━━━━━ 🎤 VOCAUX ━━━━━━━',value:'\u200b',inline:false},
        {name:`🎤 En vocal (${inVoice})`,value:voiceLines.length?voiceLines.join('\n'):'*Personne en vocal*',inline:false},
        {name:'━━━━━━ 🏠 SERVEUR ━━━━━━━',value:'\u200b',inline:false},
        {name:'💬 Texte',value:`**${textCh}**`,inline:true},
        {name:'🔊 Vocal',value:`**${voiceCh}**`,inline:true},
        {name:'🎭 Rôles',value:`**${g.roles.cache.size}**`,inline:true},
        {name:'🚀 Boosts',value:`**${g.premiumSubscriptionCount||0}** (Niv.${g.premiumTier})`,inline:true},
        {name:'📅 Créé',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
        {name:'😀 Emojis',value:`**${g.emojis.cache.size}**`,inline:true},
        {name:'━━━━━━ 🤖 BOT ━━━━━━━',value:'\u200b',inline:false},
        {name:'📦 Articles',value:`**${db.articles.length}**`,inline:true},
        {name:'🎫 Tickets',value:`**${Object.keys(db.ticketMap).length}**`,inline:true},
        {name:'⚠️ Warns',value:`**${totalWarns}**`,inline:true},
        {name:'⚡ Cmds custom',value:`**${Object.keys(db.customCmds).length}**`,inline:true},
        {name:'🎉 Giveaways',value:`**${Object.values(db.giveaways).filter(gw=>!gw.ended).length}**`,inline:true},
        {name:'💰 Joueurs',value:`**${Object.keys(db.economy).length}**`,inline:true},
        {name:'━━━━━ 🏆 TOPS ━━━━━━━',value:'\u200b',inline:false},
        {name:'🏆 Top Points',value:topEco,inline:true},
        {name:'🎤 Top Vocal',value:topVoice,inline:true},
      )
      .setTimestamp()
      .setFooter({text:`${g.name} • Données en temps réel`});
    return interaction.editReply({ embeds:[emb] });
  }

  // ══ VOCAL LIVE ══
  if (cmd==='vocal-live') { const g=interaction.guild; const voiceChannels=g.channels.cache.filter(c=>c.type===ChannelType.GuildVoice); const emb=new EmbedBuilder().setTitle('🔴 Membres en vocal maintenant').setColor(C('#ff4d4d')).setTimestamp(); let total=0; const fields=[]; voiceChannels.forEach(vc=>{const members=vc.members.filter(m=>!m.user.bot);if(!members.size)return;total+=members.size;fields.push({name:`🔊 ${vc.name} (${members.size})`,value:members.map(m=>`${m.user.username}${m.voice.selfMute?' 🔇':m.voice.selfDeaf?' 🔕':''}`).join('\n'),inline:true});}); if(!fields.length)emb.setDescription('Personne en vocal actuellement.'); else{emb.setDescription(`**${total} membre${total>1?'s':''} en vocal**`);fields.forEach(f=>emb.addFields(f));} return interaction.reply({embeds:[emb]}); }

  // ══ PING ══
  if (cmd==='ping') {
    const l = Date.now()-interaction.createdTimestamp;
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🏓 Pong !').setColor(C('#10d982')).addFields({name:'⚡ Latence',value:`\`${l}ms\``,inline:true},{name:'💓 API',value:`\`${Math.round(client.ws.ping)}ms\``,inline:true},{name:'⏱️ Uptime',value:`\`${Math.floor(client.uptime/3600000)}h ${Math.floor((client.uptime%3600000)/60000)}m\``,inline:true}).setTimestamp()] });
  }

  // ══ AIDE ══
  if (cmd==='aide') {
    const customList = Object.keys(db.customCmds).map(n=>`\`/cmd ${n}\``).join(' ')||'Aucune';
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('📋 NexusBot Premium — Toutes les commandes').setColor(C('#f0b429')).addFields(
      {name:'🛒 Boutique',value:'`/shop` `/article` `/liste-articles` `/publier-shop` `/ma-boutique` `/paiements` `/contact`'},
      {name:'🛡️ Modération',value:'`/warn` `/warns` `/clearwarns` `/kick` `/ban` `/unban` `/mute` `/unmute` `/clear` `/lock` `/unlock` `/slowmode` `/automod` `/mot-interdit`'},
      {name:'🎫 Tickets',value:'`/ticket` `/fermer` `/add` `/retirer`'},
      {name:'💰 Économie',value:'`/points` `/niveau` `/daily` `/classement` `/classement-xp` `/donner-points` `/retirer-points` `/shop-roles` `/acheter-role`'},
      {name:'⭐ Réputation',value:'`/rep` `/ma-rep`'},
      {name:'🎉 Events',value:'`/giveaway` `/giveaway-fin` `/giveaway-reroll` `/sondage` `/resultats`'},
      {name:'🎤 Vocaux',value:'`/stats-vocaux` `/classement-vocal` `/vocal-live`'},
      {name:'🎭 Rôles',value:'`/reaction-role` `/donner-role` `/retirer-role` `/role-niveau` `/ajouter-role-shop`'},
      {name:'📢 Messages',value:'`/annonce` `/message-perso` `/boutons` `/sticky` `/epingler`'},
      {name:'🎂 Anniversaires',value:'`/anniversaire` `/prochains-anniversaires`'},
      {name:'⏰ Rappels',value:'`/rappel`'},
      {name:'😂 Fun',value:'`/blague` `/pile-ou-face` `/des` `/choisir` `/citation` `/8ball` `/compter`'},
      {name:'⚡ Custom',value:customList},
      {name:'⚙️ Config',value:'`/setup-salon` `/setup-serveur` `/generer-regles` `/config-shop` `/config-bienvenue` `/role-niveau`'},
    ).setFooter({text:'NexusBot Premium • 100% gratuit • Panel Admin intégré'}).setTimestamp()] });
  }

  // ══ INFO ══
  if (cmd==='info') {
    const g = interaction.guild; await g.fetch();
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle(`🏠 ${g.name}`).setThumbnail(g.iconURL({dynamic:true})).setColor(C('#5865F2')).addFields(
      {name:'👥 Membres',value:`${g.memberCount}`,inline:true},
      {name:'📅 Créé le',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
      {name:'🎭 Rôles',value:`${g.roles.cache.size}`,inline:true},
      {name:'# Channels',value:`${g.channels.cache.size}`,inline:true},
      {name:'🚀 Boosts',value:`${g.premiumSubscriptionCount||0} (Niv.${g.premiumTier})`,inline:true},
      {name:'😀 Emojis',value:`${g.emojis.cache.size}`,inline:true},
      {name:'⚡ Cmds custom',value:`${Object.keys(db.customCmds).length}`,inline:true},
    ).setTimestamp()] });
  }

  // ══ STATS ══
  if (cmd==='stats') {
    const g = interaction.guild;
    await g.members.fetch();
    const humans  = g.members.cache.filter(m=>!m.user.bot).size;
    const bots    = g.members.cache.filter(m=>m.user.bot).size;
    const online  = g.members.cache.filter(m=>!m.user.bot&&m.presence?.status&&m.presence.status!=='offline').size;
    const inVoice = Object.keys(db.voiceActive).length;
    const bar = (v,max,len=10) => { const f=Math.round((v/Math.max(max,1))*len); return '█'.repeat(f)+'░'.repeat(len-f); };
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle(`📊 Statistiques — ${g.name}`).setThumbnail(g.iconURL({dynamic:true})).setColor(C('#5865F2')).addFields(
      {name:'👥 Total membres',value:`**${g.memberCount}**`,inline:true},
      {name:'👤 Humains',value:`**${humans}**`,inline:true},
      {name:'🤖 Bots',value:`**${bots}**`,inline:true},
      {name:'🟢 En ligne',value:`${bar(online,humans)} **${online}**`,inline:false},
      {name:'🎤 En vocal',value:`${bar(inVoice,humans)} **${inVoice}**`,inline:false},
      {name:'💬 Salons texte',value:`${g.channels.cache.filter(c=>c.type===ChannelType.GuildText).size}`,inline:true},
      {name:'🔊 Salons vocaux',value:`${g.channels.cache.filter(c=>c.type===ChannelType.GuildVoice).size}`,inline:true},
      {name:'🎭 Rôles',value:`${g.roles.cache.size}`,inline:true},
      {name:'📦 Articles',value:`${db.articles.length}`,inline:true},
      {name:'🎫 Tickets ouverts',value:`${Object.keys(db.ticketMap).length}`,inline:true},
      {name:'📅 Créé le',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
    ).setTimestamp()] });
  }

  // ══ PROFIL ══
  if (cmd==='profil') {
    const t = interaction.options.getMember('membre')||interaction.member;
    const u = getUser(t.id);
    const r = getRep(t.id);
    const needed = u.level*100;
    const pct = Math.floor((u.xp/needed)*100);
    const bar = '█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10));
    const voiceMin = db.voiceStats[t.id]?.totalMinutes||0;
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle(`👤 Profil — ${t.user.username}`).setThumbnail(t.user.displayAvatarURL({dynamic:true})).setColor(C('#5865F2')).addFields(
      {name:'💰 Points',value:`**${u.points}** pts (Rang #${rank(t.id)})`,inline:true},
      {name:'⭐ Niveau',value:`**${u.level}** (${u.xp}/${needed} XP)`,inline:true},
      {name:'⭐ Réputation',value:`**${r.total}** ⭐`,inline:true},
      {name:'💬 Messages',value:`${u.messages||0}`,inline:true},
      {name:'🎤 Temps vocal',value:`${voiceMin >= 60?`${Math.floor(voiceMin/60)}h ${voiceMin%60}m`:`${voiceMin}min`}`,inline:true},
      {name:'⚠️ Warns',value:`${(db.warns[t.id]||[]).length}`,inline:true},
      {name:'📊 Barre XP',value:`[${bar}] ${pct}%`,inline:false},
      {name:'🎭 Rôles',value:t.roles.cache.filter(r=>r.id!==interaction.guild.id).map(r=>r.toString()).slice(0,5).join(' ')||'Aucun',inline:false},
    ).setFooter({text:`Membre depuis ${t.joinedAt?.toLocaleDateString('fr-FR')||'?'}`}).setTimestamp()] });
  }

  // ══ AVATAR ══
  if (cmd==='avatar') {
    const u = interaction.options.getUser('membre')||interaction.user;
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle(`🖼️ ${u.username}`).setImage(u.displayAvatarURL({dynamic:true,size:1024})).setColor(C('#5865F2')).addFields({name:'🔗 Liens',value:`[PNG](${u.displayAvatarURL({format:'png',size:1024})}) | [WebP](${u.displayAvatarURL({format:'webp',size:1024})})`})] });
  }

  // ══ BANNIERE ══
  if (cmd==='banniere') {
    const u = interaction.options.getUser('membre')||interaction.user;
    await u.fetch();
    const banner = u.bannerURL({dynamic:true,size:1024});
    if (!banner) return interaction.reply({ embeds:[ERR('Ce membre n\'a pas de bannière.')], ephemeral:true });
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle(`🖼️ Bannière — ${u.username}`).setImage(banner).setColor(C('#5865F2'))] });
  }

  // ══ BOUTIQUE ══
  if (cmd==='shop') return interaction.reply({ embeds:[buildShopEmbed()] });

  if (cmd==='article') {
    const a = db.articles.find(x=>x.name.toLowerCase().includes(interaction.options.getString('nom').toLowerCase()));
    if (!a) return interaction.reply({ embeds:[ERR('Article introuvable.')], ephemeral:true });
    return interaction.reply({ embeds:[articleEmbed(a)] });
  }

  if (cmd==='ajouter-article') {
    const art = { id:Date.now(), name:interaction.options.getString('nom'), price:interaction.options.getString('prix'), link:interaction.options.getString('lien'), description:interaction.options.getString('description')||'', emoji:interaction.options.getString('emoji')||'🛒', stock:interaction.options.getInteger('stock')??-1, image:interaction.options.getString('image')||'', visible:true, createdAt:new Date().toLocaleString('fr-FR') };
    db.articles.push(art);
    return interaction.reply({ embeds:[OK('Article ajouté !',`**${art.emoji} ${art.name}** — ${art.price}`)] });
  }

  if (cmd==='supprimer-article') {
    const nom=interaction.options.getString('nom').toLowerCase();
    const idx=db.articles.findIndex(a=>a.name.toLowerCase().includes(nom));
    if (idx<0) return interaction.reply({ embeds:[ERR('Introuvable.')], ephemeral:true });
    const a=db.articles.splice(idx,1)[0];
    return interaction.reply({ embeds:[OK('Article supprimé',`**${a.name}** retiré.`)] });
  }

  if (cmd==='liste-articles') {
    if (!db.articles.length) return interaction.reply({ embeds:[INF('Boutique vide','Utilisez `/ajouter-article`.')] });
    const emb=new EmbedBuilder().setTitle(`🛒 Articles (${db.articles.length})`).setColor(C('#f0b429')).setTimestamp();
    db.articles.forEach(a=>emb.addFields({name:`${a.emoji} ${a.name}`,value:`${a.price} • ${a.stock===-1?'♾️':a.stock===0?'❌':'✅ '+a.stock}`,inline:true}));
    return interaction.reply({ embeds:[emb] });
  }

  if (cmd==='publier-shop') {
    const target=interaction.options.getChannel('channel')||interaction.channel;
    const mention=interaction.options.getString('mention')||'';
    await target.send({ content:mention||undefined, embeds:[buildShopEmbed()] });
    return interaction.reply({ embeds:[OK('Boutique publiée !',`Dans ${target}.`)], ephemeral:true });
  }

  if (cmd==='ma-boutique') {
    await interaction.deferReply({ ephemeral:true });
    const target=interaction.options.getChannel('channel')||interaction.channel;
    const cfg=db.boutiqueConfig;
    const mainEmb=new EmbedBuilder().setTitle(`🛒 ${cfg.nom||'NexusStore'}`).setColor(C('#f0b429')).setDescription('✅ **Livraison instantanée**\n🔒 **100% Sécurisé**\n💸 **Remboursement assuré**').setTimestamp();
    const buttons=[];
    if (cfg.lien)       buttons.push(new ButtonBuilder().setLabel('🛒 Boutique').setStyle(ButtonStyle.Link).setURL(cfg.lien));
    if (cfg.stripeLien) buttons.push(new ButtonBuilder().setLabel('💳 Stripe').setStyle(ButtonStyle.Link).setURL(cfg.stripeLien));
    if (cfg.sumupLien)  buttons.push(new ButtonBuilder().setLabel('💳 Sumup').setStyle(ButtonStyle.Link).setURL(cfg.sumupLien));
    const payload={ embeds:[mainEmb] };
    if (buttons.length) payload.components=[new ActionRowBuilder().addComponents(...buttons.slice(0,5))];
    if (interaction.options.getString('mention')) payload.content=interaction.options.getString('mention');
    await target.send(payload);
    for (const art of db.articles.filter(a=>a.visible!==false&&a.stock!==0)) {
      await target.send({ embeds:[articleEmbed(art)] });
      await new Promise(r=>setTimeout(r,600));
    }
    return interaction.editReply({ content:`✅ Boutique publiée dans ${target} !` });
  }

  if (cmd==='paiements') {
    const cfg=db.boutiqueConfig;
    const emb=new EmbedBuilder().setTitle('💳 Moyens de Paiement').setColor(C('#10d982')).setTimestamp();
    if (cfg.stripeLien) emb.addFields({name:'💳 Carte bancaire (Stripe)',value:`[**→ Payer par carte**](${cfg.stripeLien})`,inline:true});
    if (cfg.sumupLien)  emb.addFields({name:'💳 Sumup',value:`[**→ Payer via Sumup**](${cfg.sumupLien})`,inline:true});
    if (cfg.emailPaiement) emb.addFields({name:'💶 Virement / Proches',value:`Contactez : \`${cfg.emailPaiement}\``,inline:false});
    emb.addFields({name:'🎫 Commander',value:'Ouvrez un ticket avec `/ticket`',inline:false});
    return interaction.reply({ embeds:[emb] });
  }

  if (cmd==='contact') {
    const cfg=db.boutiqueConfig;
    const emb=new EmbedBuilder().setTitle(`📧 Contact — ${cfg.nom||'NexusStore'}`).setColor(C('#4d8fff')).setTimestamp();
    if (cfg.emailContact) emb.addFields({name:'📧 Email',value:`\`${cfg.emailContact}\``,inline:false});
    emb.addFields({name:'🎫 Support Discord',value:'Ouvrez un ticket avec `/ticket`',inline:false});
    const buttons=[new ButtonBuilder().setLabel('🎫 Ticket').setStyle(ButtonStyle.Primary).setCustomId('t_open_sup')];
    if (cfg.emailContact) buttons.unshift(new ButtonBuilder().setLabel('📧 Email').setStyle(ButtonStyle.Link).setURL(`mailto:${cfg.emailContact}`));
    return interaction.reply({ embeds:[emb], components:[new ActionRowBuilder().addComponents(...buttons)] });
  }

  // ══ MODÉRATION ══
  if (cmd==='warn') {
    const t=interaction.options.getMember('membre'),r=interaction.options.getString('raison');
    if (!db.warns[t.id]) db.warns[t.id]=[];
    db.warns[t.id].push({ reason:r, modId:interaction.user.id, date:new Date().toLocaleString('fr-FR') });
    const total=db.warns[t.id].length;
    await interaction.reply({ embeds:[new EmbedBuilder().setTitle('⚠️ Avertissement').setColor(C('#f0b429')).addFields({name:'👤 Membre',value:`${t}`,inline:true},{name:'📝 Raison',value:r,inline:true},{name:'🔢 Total',value:`${total}`,inline:true}).setTimestamp()] });
    t.send({ embeds:[new EmbedBuilder().setTitle('⚠️ Avertissement reçu').setDescription(`**Serveur :** ${interaction.guild.name}\n**Raison :** ${r}\n**Total warns :** ${total}`).setColor(C('#f0b429')).setTimestamp()] }).catch(()=>{});
    if (CH_LOGS) { const l=interaction.guild.channels.cache.get(CH_LOGS); if(l) l.send({ embeds:[new EmbedBuilder().setTitle('⚠️ Warn').setColor(C('#f0b429')).addFields({name:'Membre',value:`${t.user.username} (${t.id})`},{name:'Raison',value:r},{name:'Modérateur',value:interaction.user.username},{name:'Total',value:`${total}`}).setTimestamp()] }); }
    return;
  }

  if (cmd==='warns') {
    const t=interaction.options.getMember('membre'),warns=db.warns[t.id]||[];
    const emb=new EmbedBuilder().setTitle(`⚠️ Warns — ${t.user.username}`).setColor(C('#f0b429'));
    if (!warns.length) emb.setDescription('✅ Aucun avertissement.');
    else warns.forEach((w,i)=>emb.addFields({name:`#${i+1} • ${w.date}`,value:w.reason}));
    return interaction.reply({ embeds:[emb] });
  }

  if (cmd==='clearwarns') { const t=interaction.options.getMember('membre'); db.warns[t.id]=[]; return interaction.reply({ embeds:[OK('Warns effacés',`Warns de ${t} supprimés.`)] }); }

  if (cmd==='sanctions') {
    const t=interaction.options.getMember('membre'),warns=db.warns[t.id]||[];
    const emb=new EmbedBuilder().setTitle(`📋 Sanctions — ${t.user.username}`).setColor(C('#ff4d4d')).addFields({name:'⚠️ Warns',value:`${warns.length}`,inline:true},{name:'💰 Points',value:`${getUser(t.id).points}`,inline:true});
    warns.forEach((w,i)=>emb.addFields({name:`Warn #${i+1}`,value:`${w.date}: ${w.reason}`}));
    return interaction.reply({ embeds:[emb] });
  }

  if (cmd==='kick') { const t=interaction.options.getMember('membre'),r=interaction.options.getString('raison')||'Aucune raison'; if(!t.kickable) return interaction.reply({ embeds:[ERR('Impossible.')], ephemeral:true }); t.send({ embeds:[ERR(`Expulsé de **${interaction.guild.name}**. Raison : ${r}`)] }).catch(()=>{}); await t.kick(r); await interaction.reply({ embeds:[new EmbedBuilder().setTitle('👢 Expulsé').setColor(C('#ff4d4d')).addFields({name:'Membre',value:t.user.username,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()] }); if(CH_LOGS){const l=interaction.guild.channels.cache.get(CH_LOGS);if(l)l.send({embeds:[new EmbedBuilder().setTitle('👢 Kick').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${t.user.username} (${t.id})`},{name:'Raison',value:r},{name:'Modérateur',value:interaction.user.username}).setTimestamp()]});}return; }

  if (cmd==='ban') { const t=interaction.options.getMember('membre'),r=interaction.options.getString('raison')||'Aucune raison'; if(!t.bannable) return interaction.reply({ embeds:[ERR('Impossible.')], ephemeral:true }); t.send({ embeds:[ERR(`Banni de **${interaction.guild.name}**. Raison : ${r}`)] }).catch(()=>{}); await t.ban({reason:r}); await interaction.reply({ embeds:[new EmbedBuilder().setTitle('🔨 Banni').setColor(C('#ff4d4d')).addFields({name:'Membre',value:t.user.username,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()] }); if(CH_LOGS){const l=interaction.guild.channels.cache.get(CH_LOGS);if(l)l.send({embeds:[new EmbedBuilder().setTitle('🔨 Ban').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${t.user.username} (${t.id})`},{name:'Raison',value:r},{name:'Modérateur',value:interaction.user.username}).setTimestamp()]});}return; }

  if (cmd==='unban') { try{await interaction.guild.members.unban(interaction.options.getString('userid'));return interaction.reply({embeds:[OK('Débanni','')]});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  if (cmd==='mute') { const t=interaction.options.getMember('membre'),min=interaction.options.getInteger('minutes')||10,r=interaction.options.getString('raison')||'Aucune raison'; try{await t.timeout(min*60000,r);t.send({embeds:[new EmbedBuilder().setTitle('🔇 Sourdine').setDescription(`**Serveur :** ${interaction.guild.name}\n**Durée :** ${min} min\n**Raison :** ${r}`).setColor(C('#4d8fff')).setTimestamp()]}).catch(()=>{});return interaction.reply({embeds:[new EmbedBuilder().setTitle('🔇 Sourdine').setColor(C('#f0b429')).addFields({name:'Membre',value:`${t}`,inline:true},{name:'Durée',value:`${min}min`,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()]});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  if (cmd==='unmute') { try{await interaction.options.getMember('membre').timeout(null);return interaction.reply({embeds:[OK('Sourdine levée','')]});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  if (cmd==='clear') { try{const d=await interaction.channel.bulkDelete(interaction.options.getInteger('nombre'),true);return interaction.reply({embeds:[OK(`${d.size} messages supprimés`,'')],ephemeral:true});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  if (cmd==='lock')   { await interaction.channel.permissionOverwrites.edit(interaction.guild.id,{SendMessages:false}); return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🔒 Salon verrouillé').setColor(C('#ff4d4d')).setTimestamp()] }); }
  if (cmd==='unlock') { await interaction.channel.permissionOverwrites.edit(interaction.guild.id,{SendMessages:null});  return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🔓 Salon déverrouillé').setColor(C('#10d982')).setTimestamp()] }); }
  if (cmd==='slowmode') { await interaction.channel.setRateLimitPerUser(interaction.options.getInteger('secondes')); return interaction.reply({ embeds:[OK('Slow mode mis à jour','')] }); }

  if (cmd==='automod') {
    const antispam=interaction.options.getBoolean('antispam');
    const antilink=interaction.options.getBoolean('antilink');
    const anticaps=interaction.options.getBoolean('anticaps');
    if (antispam!==null) db.modConfig.antispam=antispam;
    if (antilink!==null) db.modConfig.antilink=antilink;
    if (anticaps!==null) db.modConfig.anticaps=anticaps;
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('⚙️ Auto-Modération mise à jour').setColor(C('#10d982')).addFields(
      {name:'🚨 Anti-spam',value:db.modConfig.antispam?'✅ Activé':'❌ Désactivé',inline:true},
      {name:'🔗 Anti-lien',value:db.modConfig.antilink?'✅ Activé':'❌ Désactivé',inline:true},
      {name:'🔠 Anti-caps',value:db.modConfig.anticaps?'✅ Activé':'❌ Désactivé',inline:true},
    ).setTimestamp()] });
  }

  if (cmd==='mot-interdit') {
    const action=interaction.options.getString('action');
    const mot=interaction.options.getString('mot');
    if (action==='add'&&mot) { if(!db.modConfig.bannedWords.includes(mot.toLowerCase())) db.modConfig.bannedWords.push(mot.toLowerCase()); return interaction.reply({ embeds:[OK('Mot interdit ajouté',`\`${mot}\` sera maintenant supprimé automatiquement.`)] }); }
    if (action==='remove'&&mot) { db.modConfig.bannedWords=db.modConfig.bannedWords.filter(w=>w!==mot.toLowerCase()); return interaction.reply({ embeds:[OK('Mot retiré',`\`${mot}\` retiré de la liste.`)] }); }
    if (action==='list') { return interaction.reply({ embeds:[INF('Mots interdits',db.modConfig.bannedWords.length?db.modConfig.bannedWords.map(w=>`\`${w}\``).join(', '):'Aucun mot interdit.')] }); }
  }

  // ══ TICKETS ══
  if (cmd==='ticket') {
    const cats = db.ticketCategories;
    if (cats.length === 1) {
      await interaction.deferReply({ ephemeral:true });
      try { const r=await openTicket(interaction.guild,interaction.user,cats[0].id); if(r.already)return interaction.editReply({content:`❌ Ticket existant : <#${r.channel.id}>`}); return interaction.editReply({content:`✅ Ticket créé : <#${r.channel.id}>`}); } catch(e){return interaction.editReply({content:`❌ ${e.message}`});}
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_category')
      .setPlaceholder('📋 Choisissez une catégorie...')
      .addOptions(cats.map(c=>({ label:c.label, description:c.desc||c.label, value:c.id })));
    return interaction.reply({ content:'📋 Choisissez la catégorie de votre ticket :', components:[new ActionRowBuilder().addComponents(menu)], ephemeral:true });
  }

  if (cmd==='setup-tickets') {
    const target = interaction.options.getChannel('channel') || interaction.channel;
    await sendTicketPanel(target);
    return interaction.reply({ embeds:[OK('Panel tickets installé !',`Panel avec ${db.ticketCategories.length} catégorie(s) dans ${target}.`)], ephemeral:true });
  }

  if (cmd==='ajouter-categorie') {
    const id=interaction.options.getString('id').toLowerCase().replace(/\s+/g,'-'), label=interaction.options.getString('label'), desc=interaction.options.getString('description'), color=interaction.options.getString('couleur')||'#5865F2';
    if (db.ticketCategories.find(c=>c.id===id)) return interaction.reply({embeds:[ERR(`Catégorie \`${id}\` déjà existante.`)],ephemeral:true});
    db.ticketCategories.push({id,label,desc:desc||label,color});
    return interaction.reply({embeds:[OK('Catégorie ajoutée !',`**${label}** ajoutée.\n\`/setup-tickets\` pour mettre à jour le panel.`)]});
  }
  if (cmd==='fermer') { if(!interaction.channel.name.startsWith('ticket-'))return interaction.reply({embeds:[ERR('Pas dans un ticket.')],ephemeral:true});await interaction.reply({content:'🔒 Fermeture dans 5s...'});return closeTicket(interaction.channel,interaction.user); }
  if (cmd==='add') { const t=interaction.options.getMember('membre');await interaction.channel.permissionOverwrites.edit(t.id,{ViewChannel:true,SendMessages:true});return interaction.reply({embeds:[OK('Membre ajouté',`${t} a accès à ce ticket.`)]}); }
  if (cmd==='retirer') { const t=interaction.options.getMember('membre');await interaction.channel.permissionOverwrites.edit(t.id,{ViewChannel:false});return interaction.reply({embeds:[OK('Membre retiré',`${t} n\'a plus accès.`)]}); }

  // ══ ÉCONOMIE ══
  if (cmd==='points') { const t=interaction.options.getUser('membre')||interaction.user;const u=getUser(t.id);return interaction.reply({embeds:[new EmbedBuilder().setTitle(`💰 ${t.username}`).setThumbnail(t.displayAvatarURL({dynamic:true})).setColor(C('#f0b429')).addFields({name:'💰 Points',value:`**${u.points}**`,inline:true},{name:'🏆 Rang',value:`#${rank(t.id)}`,inline:true},{name:'📈 Total gagné',value:`${u.totalEarned}`,inline:true}).setTimestamp()]}); }

  if (cmd==='niveau') { const t=interaction.options.getUser('membre')||interaction.user;const u=getUser(t.id);const needed=u.level*100;const pct=Math.floor((u.xp/needed)*100);const bar='█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10));return interaction.reply({embeds:[new EmbedBuilder().setTitle(`⭐ Niveau — ${t.username}`).setThumbnail(t.displayAvatarURL({dynamic:true})).setColor(C('#9d6fff')).addFields({name:'⭐ Niveau',value:`**${u.level}**`,inline:true},{name:'📊 XP',value:`${u.xp}/${needed}`,inline:true},{name:'💬 Messages',value:`${u.messages||0}`,inline:true},{name:'📈 Progression',value:`[${bar}] ${pct}%`,inline:false}).setTimestamp()]}); }

  if (cmd==='daily') { const u=getUser(interaction.user.id);const cd=24*3600000;if(Date.now()-u.lastDaily<cd){const h=Math.ceil((cd-(Date.now()-u.lastDaily))/3600000);return interaction.reply({embeds:[ERR(`Reviens dans **${h}h**.`)],ephemeral:true});}const gain=Math.floor(Math.random()*151)+50;u.lastDaily=Date.now();addPts(interaction.user.id,gain);addXP(interaction.user.id,20);return interaction.reply({embeds:[new EmbedBuilder().setTitle('🎁 Daily récupéré !').setDescription(`+**${gain} points** !\nTotal : **${u.points} points**`).setColor(C('#10d982')).setTimestamp()]}); }

  if (cmd==='classement') { const top=Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,10);const medals=['🥇','🥈','🥉'];return interaction.reply({embeds:[new EmbedBuilder().setTitle('🏆 Classement Points').setDescription(top.length?top.map(([id,d],i)=>`${medals[i]||`**${i+1}.**`} <@${id}> — **${d.points} pts**`).join('\n'):'Aucun').setColor(C('#f0b429')).setTimestamp()]}); }

  if (cmd==='classement-xp') { const top=Object.entries(db.economy).sort(([,a],[,b])=>b.level-a.level).slice(0,10);const medals=['🥇','🥈','🥉'];return interaction.reply({embeds:[new EmbedBuilder().setTitle('⭐ Classement Niveaux').setDescription(top.length?top.map(([id,d],i)=>`${medals[i]||`**${i+1}.**`} <@${id}> — Niveau **${d.level}** (${d.xp} XP)`).join('\n'):'Aucun').setColor(C('#9d6fff')).setTimestamp()]}); }

  if (cmd==='donner-points') { const t=interaction.options.getUser('membre'),n=interaction.options.getInteger('montant');addPts(t.id,n);return interaction.reply({embeds:[OK('Points donnés',`**+${n} pts** à <@${t.id}>. Total : **${getUser(t.id).points} pts**`)]}); }

  if (cmd==='retirer-points') { const t=interaction.options.getUser('membre'),n=interaction.options.getInteger('montant');const u=getUser(t.id);u.points=Math.max(0,u.points-n);return interaction.reply({embeds:[OK('Points retirés',`**-${n} pts** à <@${t.id}>. Solde : **${u.points} pts**`)]}); }

  if (cmd==='shop-roles') { if(!db.roleShop.length)return interaction.reply({embeds:[INF('Boutique vide','Aucun rôle en vente.')]});const u=getUser(interaction.user.id);const emb=new EmbedBuilder().setTitle('🛍️ Boutique de Rôles').setColor(C('#f0b429')).setDescription(`Vos points : **${u.points} pts**\n\nUtilisez \`/acheter-role\` pour acheter.`);db.roleShop.forEach(r=>{const role=interaction.guild.roles.cache.get(r.roleId);if(role)emb.addFields({name:`@${role.name}`,value:`${r.price} points`,inline:true});});return interaction.reply({embeds:[emb]}); }

  if (cmd==='acheter-role') { const role=interaction.options.getRole('role'),item=db.roleShop.find(r=>r.roleId===role.id);if(!item)return interaction.reply({embeds:[ERR('Ce rôle n\'est pas en vente.')],ephemeral:true});const u=getUser(interaction.user.id);if(u.points<item.price)return interaction.reply({embeds:[ERR(`Points insuffisants. Il faut **${item.price} pts**.`)],ephemeral:true});u.points-=item.price;await interaction.member.roles.add(role);return interaction.reply({embeds:[OK('Rôle acheté !',`**@${role.name}** pour **${item.price} pts** !\nSolde : **${u.points} pts**`)]}); }

  if (cmd==='ajouter-role-shop') { const role=interaction.options.getRole('role'),prix=interaction.options.getInteger('prix'),i=db.roleShop.findIndex(r=>r.roleId===role.id);if(i>=0)db.roleShop[i].price=prix;else db.roleShop.push({roleId:role.id,price:prix});return interaction.reply({embeds:[OK('Rôle en vente !',`**@${role.name}** — **${prix} points**`)]}); }

  if (cmd==='role-niveau') { const niveau=interaction.options.getInteger('niveau'),role=interaction.options.getRole('role');const i=db.levelRoles.findIndex(lr=>lr.level===niveau);if(i>=0)db.levelRoles[i].roleId=role.id;else db.levelRoles.push({level:niveau,roleId:role.id});return interaction.reply({embeds:[OK('Rôle de niveau configuré',`Au niveau **${niveau}**, les membres reçoivent **@${role.name}**.`)]}); }

  // ══ RÉPUTATION ══
  if (cmd==='rep') {
    const t=interaction.options.getUser('membre');
    if (t.id===interaction.user.id) return interaction.reply({ embeds:[ERR('Tu ne peux pas te donner de réputation.')], ephemeral:true });
    const myRep=getRep(interaction.user.id);
    const cd=12*3600000;
    if (Date.now()-myRep.lastGiven<cd) { const h=Math.ceil((cd-(Date.now()-myRep.lastGiven))/3600000); return interaction.reply({ embeds:[ERR(`Tu as déjà donné de la réputation. Reviens dans **${h}h**.`)], ephemeral:true }); }
    myRep.lastGiven=Date.now();
    const theirRep=getRep(t.id);
    theirRep.total++;
    addPts(t.id, 10);
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('⭐ Réputation donnée !').setDescription(`Tu as donné ⭐ à <@${t.id}> !\nIl a maintenant **${theirRep.total} ⭐** de réputation.`).setColor(C('#f0b429')).setTimestamp()] });
  }

  if (cmd==='ma-rep') { const t=interaction.options.getUser('membre')||interaction.user;const r=getRep(t.id);return interaction.reply({embeds:[new EmbedBuilder().setTitle(`⭐ Réputation — ${t.username}`).setDescription(`**${t.username}** a **${r.total} ⭐** de réputation.`).setColor(C('#f0b429')).setTimestamp()]}); }

  // ══ GIVEAWAY ══
  if (cmd==='giveaway') { const prix=interaction.options.getString('prix'),minutes=interaction.options.getInteger('minutes'),target=interaction.options.getChannel('channel')||interaction.channel,end=Date.now()+minutes*60000,row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gw_join').setLabel('🎉 Participer').setStyle(ButtonStyle.Primary)),msg=await target.send({embeds:[new EmbedBuilder().setTitle('🎉 GIVEAWAY').setDescription(`**🏆 Prix :** ${prix}\n\n⏱️ **Fin :** ${new Date(end).toLocaleString('fr-FR')}\n👥 **Participants :** 0\n\nClique sur le bouton pour participer !`).setColor(C('#f0b429')).setTimestamp(new Date(end)).setFooter({text:`Organisé par ${interaction.user.username}`})],components:[row]});db.giveaways[msg.id]={prize:prix,end,channel:target.id,entries:new Set(),ended:false};return interaction.reply({embeds:[OK('Giveaway créé !',`**${prix}** dans ${target} — ${minutes}min.`)],ephemeral:true}); }

  if (cmd==='giveaway-fin') { const id=interaction.options.getString('messageid');if(!db.giveaways[id])return interaction.reply({embeds:[ERR('Introuvable.')],ephemeral:true});await endGiveaway(id,interaction.guild);return interaction.reply({embeds:[OK('Terminé !','')],ephemeral:true}); }

  if (cmd==='giveaway-reroll') { const gw=db.giveaways[interaction.options.getString('messageid')];if(!gw)return interaction.reply({embeds:[ERR('Introuvable.')],ephemeral:true});const entries=[...gw.entries];if(!entries.length)return interaction.reply({embeds:[ERR('Aucun participant.')],ephemeral:true});const winner=entries[Math.floor(Math.random()*entries.length)];gw.winner=winner;addPts(winner,100);return interaction.reply({embeds:[new EmbedBuilder().setTitle('🔄 Nouveau Gagnant !').setDescription(`**Prix :** ${gw.prize}\n**Gagnant :** <@${winner}>`).setColor(C('#10d982')).setTimestamp()]}); }

  // ── SUIVI DE COMMANDE ──────────────────────────────────────────
  if (cmd === 'macommande') {
    const orderId = interaction.options.getString('id').toUpperCase().replace('CMD-','');
    const order   = db.orders.find(o => o.id === `CMD-${orderId}` || o.id === orderId);
    if (!order) return interaction.reply({ embeds: [ERR(`Commande **CMD-${orderId}** introuvable.\nVérifie l'ID ou ouvre un ticket.`)], ephemeral: true });
    if (order.userId && order.userId !== interaction.user.id) return interaction.reply({ embeds: [ERR('Cette commande ne t\'appartient pas.')], ephemeral: true });
    const statusEmoji = { pending:'⏳', confirmed:'✅', delivered:'📦', cancelled:'❌', refunded:'💸' };
    const statusLabel = { pending:'En attente', confirmed:'Confirmée', delivered:'Livrée', cancelled:'Annulée', refunded:'Remboursée' };
    const emb = new EmbedBuilder()
      .setTitle(`📦 Commande ${order.id}`)
      .setColor(C(order.status==='delivered'?'#10d982':order.status==='cancelled'?'#ff4d4d':'#5865F2'))
      .addFields(
        { name:'📦 Article',  value: order.articleName || '—', inline: true },
        { name:'💰 Prix',     value: order.price || '—',       inline: true },
        { name:'📅 Date',     value: order.date || '—',        inline: true },
        { name:'📊 Statut',   value: `${statusEmoji[order.status]||'❓'} ${statusLabel[order.status]||order.status}`, inline: true },
      )
      .setFooter({ text: 'Pour toute question → ouvrez un ticket' })
      .setTimestamp();
    if (order.notes) emb.addFields({ name:'📝 Note', value: order.notes });
    return interaction.reply({ embeds: [emb], ephemeral: true });
  }

  if (cmd === 'commandes') {
    const userOrders = db.orders.filter(o => o.userId === interaction.user.id);
    if (!userOrders.length) return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📋 Tes commandes').setDescription('Aucune commande trouvée.\nPassez votre première commande sur **NexusStore** !').setColor(C('#5865F2'))], ephemeral: true });
    const statusEmoji = { pending:'⏳', confirmed:'✅', delivered:'📦', cancelled:'❌', refunded:'💸' };
    const desc = userOrders.slice(0,10).map(o =>
      `**${o.id}** — ${o.articleName} — ${o.price}\n└ ${statusEmoji[o.status]||'❓'} ${o.status} · ${o.date}`
    ).join('\n\n');
    return interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle(`📋 Tes commandes (${userOrders.length})`)
      .setDescription(desc)
      .setColor(C('#5865F2'))
      .setFooter({ text: 'Utilise /macommande <ID> pour les détails' })
    ], ephemeral: true });
  }

  // ══ SONDAGES ══
  if (cmd==='sondage') { const question=interaction.options.getString('question'),opts=interaction.options.getString('options').split('|').map(s=>s.trim()).filter(Boolean).slice(0,9);if(opts.length<2)return interaction.reply({embeds:[ERR('Minimum 2 options.')],ephemeral:true});const emojis=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'],msg=await interaction.reply({embeds:[new EmbedBuilder().setTitle(`📊 ${question}`).setDescription(opts.map((o,i)=>`${emojis[i]} ${o}`).join('\n')).setColor(C('#4d8fff')).setTimestamp().setFooter({text:`Par ${interaction.user.username} • Cliquez sur une réaction pour voter`})],fetchReply:true});db.polls[msg.id]={question,options:opts,votes:Object.fromEntries(opts.map((_,i)=>[i,[]]))};for(let i=0;i<opts.length;i++)await msg.react(emojis[i]);return; }

  if (cmd==='resultats') { const poll=db.polls[interaction.options.getString('messageid')];if(!poll)return interaction.reply({embeds:[ERR('Introuvable.')],ephemeral:true});const total=Object.values(poll.votes).reduce((s,v)=>s+v.length,0);const emb=new EmbedBuilder().setTitle(`📊 Résultats — ${poll.question}`).setColor(C('#4d8fff'));poll.options.forEach((o,i)=>{const votes=poll.votes[i]?.length||0,pct=total>0?Math.round((votes/total)*100):0,bar='█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10));emb.addFields({name:o,value:`[${bar}] **${pct}%** (${votes} vote(s))`});});emb.setFooter({text:`${total} vote(s) au total`}).setTimestamp();return interaction.reply({embeds:[emb]}); }

  // ══ RÔLES ══
  if (cmd==='reaction-role') {
    const titre=interaction.options.getString('titre'),paires=interaction.options.getString('paires'),target=interaction.options.getChannel('channel')||interaction.channel;
    const pairs=paires.split('|').map(p=>p.trim()).filter(Boolean);
    const rrMap={},lines=[];
    for(const p of pairs){const[emoji,roleId]=p.split(':');if(!emoji||!roleId)continue;rrMap[emoji.trim()]=roleId.trim();const role=interaction.guild.roles.cache.get(roleId.trim());lines.push(`${emoji.trim()} → ${role?`@${role.name}`:roleId}`);}
    const emb=new EmbedBuilder().setTitle(titre).setDescription('Cliquez sur une réaction pour obtenir le rôle correspondant :\n\n'+lines.join('\n')).setColor(C('#f0b429')).setTimestamp();
    const msg=await target.send({embeds:[emb]});
    db.reactionRoles[msg.id]=rrMap;
    for(const emoji of Object.keys(rrMap))await msg.react(emoji).catch(()=>{});
    return interaction.reply({embeds:[OK('Reaction roles créé !',`${Object.keys(rrMap).length} rôle(s) dans ${target}`)],ephemeral:true});
  }

  if (cmd==='donner-role') { const t=interaction.options.getMember('membre'),r=interaction.options.getRole('role');try{await t.roles.add(r);return interaction.reply({embeds:[OK('Rôle donné',`**@${r.name}** → ${t}`)],ephemeral:true});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }
  if (cmd==='retirer-role') { const t=interaction.options.getMember('membre'),r=interaction.options.getRole('role');try{await t.roles.remove(r);return interaction.reply({embeds:[OK('Rôle retiré',`**@${r.name}** retiré de ${t}`)],ephemeral:true});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  // ══ MESSAGES ══
  if (cmd==='annonce') { const target=interaction.options.getChannel('channel')||interaction.channel,ment=interaction.options.getString('mention')||'',img=interaction.options.getString('image')||'',emb=new EmbedBuilder().setTitle(`📢 ${interaction.options.getString('titre')}`).setDescription(interaction.options.getString('message')).setColor(C(interaction.options.getString('couleur')||'#5865F2')).setTimestamp().setFooter({text:`Annoncé par ${interaction.user.username}`});if(img)emb.setImage(img);await target.send({content:ment||undefined,embeds:[emb]});return interaction.reply({embeds:[OK('Annonce envoyée',`Dans ${target}.`)],ephemeral:true}); }

  if (cmd==='message-perso') { const target=interaction.options.getChannel('channel')||interaction.channel;await target.send({content:interaction.options.getString('contenu')});return interaction.reply({embeds:[OK('Message envoyé',`Dans ${target}.`)],ephemeral:true}); }

  if (cmd==='boutons') { const titre=interaction.options.getString('titre'),desc=interaction.options.getString('description')||'',couleur=interaction.options.getString('couleur')||'#5865F2',target=interaction.options.getChannel('channel')||interaction.channel,mention=interaction.options.getString('mention')||'';const btnsRaw=['btn1','btn2','btn3'].map(k=>interaction.options.getString(k)).filter(Boolean);const buttons=btnsRaw.map(raw=>{const[label,url]=raw.split('|');return url?.startsWith('http')?new ButtonBuilder().setLabel(label.trim()).setStyle(ButtonStyle.Link).setURL(url.trim()):null;}).filter(Boolean);if(!buttons.length)return interaction.reply({embeds:[ERR('Aucun bouton valide.')],ephemeral:true});const emb=new EmbedBuilder().setTitle(titre).setColor(C(couleur)).setTimestamp();if(desc)emb.setDescription(desc);const payload={embeds:[emb],components:[new ActionRowBuilder().addComponents(...buttons)]};if(mention)payload.content=mention;await target.send(payload);return interaction.reply({embeds:[OK(`${buttons.length} bouton(s) envoyé(s) !`,`Dans ${target}.`)],ephemeral:true}); }

  if (cmd==='sticky') {
    const message=interaction.options.getString('message');
    if (!message) { delete db.sticky[interaction.channel.id]; return interaction.reply({embeds:[OK('Sticky supprimé','Le message épinglé a été retiré de ce salon.')]}); }
    db.sticky[interaction.channel.id]={ content:message, msgId:'' };
    const msg=await interaction.channel.send({embeds:[new EmbedBuilder().setDescription(`📌 **Message épinglé**\n\n${message}`).setColor(C('#5865F2'))]});
    db.sticky[interaction.channel.id].msgId=msg.id;
    return interaction.reply({embeds:[OK('Sticky activé',`Le message sera ré-envoyé après chaque message dans ce salon.`)],ephemeral:true});
  }

  if (cmd==='epingler') { try{const msg=await interaction.channel.messages.fetch(interaction.options.getString('messageid'));await msg.pin();return interaction.reply({embeds:[OK('Épinglé !','')]});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  // ══ SETUP ══
  const SALON_CONFIGS = {
    shop:{name:'🛒・boutique',topic:'Notre boutique'},
    rules:{name:'📜・règles',topic:'Règles du serveur'},
    welcome:{name:'👋・bienvenue',topic:'Bienvenue'},
    tickets:{name:'🎫・tickets',topic:'Support'},
    annonces:{name:'📢・annonces',topic:'Annonces officielles'},
    general:{name:'💬・général',topic:'Discussion générale'},
    classement:{name:'🏆・classement',topic:'Classement des membres'},
    vocaux:{name:'📊・stats-vocaux',topic:'Statistiques vocaux en temps réel'},
  };

  if (cmd==='generer-regles') {
    const type=interaction.options.getString('type'),target=interaction.options.getChannel('channel');
    const RULES={
      vente:[{e:'🤝',t:'Respect mutuel',d:'Aucune insulte, moquerie ou comportement toxique.'},{e:'💰',t:'Transactions honnêtes',d:'Toute vente doit être transparente et exacte.'},{e:'🚫',t:'Zéro escroquerie',d:'Toute fraude = bannissement définitif.'},{e:'📦',t:'Livraison & Support',d:'Livrez dans les délais annoncés. Problème → ticket.'},{e:'🔒',t:'Confidentialité',d:'Ne partagez pas vos données personnelles.'},{e:'📢',t:'Publicité interdite',d:'Aucune promo externe sans autorisation du staff.'},{e:'🎫',t:'Tickets',d:'Pour tout litige utilisez /ticket.'},{e:'🌍',t:'Français',d:'Les salons généraux sont en français.'},{e:'⚖️',t:'Décisions staff',d:'Les décisions du staff sont définitives.'},{e:'🔞',t:'Âge minimum',d:'Certains produits sont réservés aux majeurs.'}],
      gaming:[{e:'🎮',t:'Fair-play',d:'Pas de triche ni de comportement toxique.'},{e:'🤝',t:'Respect',d:'Aucune insulte ou harassment.'},{e:'📢',t:'Pas de spam',d:'Pas de flood ni de mentions abusives.'},{e:'🚫',t:'Contenu approprié',d:'Pas de NSFW hors salons dédiés.'},{e:'🎤',t:'Vocaux',d:'Micro correct, pas de bruit excessif.'},{e:'🏆',t:'Compétitions',d:'Les décisions des arbitres sont finales.'},{e:'📱',t:'Self-promo',d:'Streams/vidéos uniquement dans le salon dédié.'},{e:'🔒',t:'Comptes',d:'Ne partagez jamais vos identifiants de jeu.'},{e:'⚖️',t:'Sanctions',d:'Warn → Mute → Kick → Ban.'},{e:'🎫',t:'Support',d:'Problème → /ticket.'}],
      communaute:[{e:'💙',t:'Bienveillance',d:'Soutenez-vous et restez respectueux.'},{e:'🗣️',t:'Communication saine',d:'Les désaccords sont normaux, les conflits non.'},{e:'🚫',t:'Discrimination zéro',d:'Aucune discrimination sous aucune forme.'},{e:'📵',t:'Anti-spam',d:'Un message à la fois.'},{e:'🔞',t:'Contenu adapté',d:'Respectez les restrictions d\'âge.'},{e:'🔒',t:'Vie privée',d:'Ne partagez pas d\'infos personnelles.'},{e:'📢',t:'Publicité',d:'Toute promo doit être approuvée.'},{e:'🎫',t:'Signalements',value:'Utilisez /ticket.'},{e:'🏅',t:'Rôles',d:'Gagnés par l\'activité.'},{e:'⚖️',t:'Modération',d:'Les modérateurs ont le dernier mot.'}],
    };
    const rules=RULES[type]||RULES.vente;
    const emb=new EmbedBuilder().setTitle('📜 Règles du Serveur').setColor(C('#e74c3c')).setTimestamp().setFooter({text:'Non-respect = sanctions'});
    rules.forEach((r,i)=>emb.addFields({name:`${r.e} ${i+1}. ${r.t}`,value:r.d||r.value}));
    if(target){await target.send({embeds:[emb]});return interaction.reply({embeds:[OK('Règles publiées !',`Dans ${target}.`)],ephemeral:true});}
    return interaction.reply({embeds:[emb]});
  }

  if (cmd==='setup-salon') {
    const type=interaction.options.getString('type'),config=SALON_CONFIGS[type];
    if(!config)return interaction.reply({embeds:[ERR('Type invalide.')],ephemeral:true});
    await interaction.deferReply({ephemeral:true});
    try {
      const ch=await interaction.guild.channels.create({name:config.name,type:ChannelType.GuildText,topic:config.topic});
      if(type==='tickets'){const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('t_open_cmd').setLabel('📦 Commande').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('t_open_sup').setLabel('🔧 Support').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('t_open_q').setLabel('❓ Question').setStyle(ButtonStyle.Success));await ch.send({embeds:[new EmbedBuilder().setTitle('🎫 Centre de Support').setDescription('Choisissez la catégorie de votre ticket :').setColor(C('#5865F2')).setTimestamp()],components:[row]});}
      if(type==='shop'&&db.articles.length>0)await ch.send({embeds:[buildShopEmbed()]});
      if(type==='vocaux'){const vEmb=new EmbedBuilder().setTitle('🎤 Stats Vocaux en Direct').setDescription('Les statistiques se mettront à jour automatiquement.').setColor(C('#9d6fff')).setTimestamp();await ch.send({embeds:[vEmb]});}
      return interaction.editReply({content:`✅ Salon **${config.name}** créé : <#${ch.id}>`});
    } catch(e){return interaction.editReply({content:`❌ ${e.message}`});}
  }

  if (cmd==='setup-serveur') {
    await interaction.deferReply({ephemeral:true});
    const created=[];
    for(const s of ['rules','welcome','shop','tickets','annonces','general','classement','vocaux']){
      try{const cfg=SALON_CONFIGS[s];const ch=await interaction.guild.channels.create({name:cfg.name,type:ChannelType.GuildText,topic:cfg.topic});created.push(`<#${ch.id}>`);}catch(e){}
    }
    return interaction.editReply({embeds:[new EmbedBuilder().setTitle('🚀 Serveur configuré !').setColor(C('#10d982')).setDescription(`**${created.length} salons créés :**\n${created.join('\n')}\n\n✅ Utilisez \`/generer-regles\` pour les règles\n✅ \`/config-bienvenue\` pour le message de bienvenue`).setTimestamp()]});
  }

  if (cmd==='config-shop') { const cfg=db.shopConfig;const n=interaction.options.getString('nom'),col=interaction.options.getString('couleur'),ft=interaction.options.getString('footer');if(n)cfg.name=n;if(col)cfg.color=col;if(ft)cfg.footer=ft;return interaction.reply({embeds:[OK('Config boutique sauvegardée !',`Nom : **${cfg.name}**`)]}); }

  if (cmd==='config-bienvenue') {
    const msg=interaction.options.getString('message'),color=interaction.options.getString('couleur');
    if(msg) db.welcomeConfig.message=msg;
    if(color) db.welcomeConfig.color=color;
    return interaction.reply({embeds:[new EmbedBuilder().setTitle('⚙️ Config bienvenue mise à jour').setColor(C('#10d982')).setDescription(`**Message :**\n${db.welcomeConfig.message}\n\n**Variables :** {user}, {server}, {count}, {username}`).setTimestamp()]});
  }

  if (cmd==='regles') {
    const rules=[{e:'🤝',t:'Respect',d:'Traitez chaque membre avec respect.'},{e:'🚫',t:'Zéro toxicité',d:'Aucune insulte ni comportement toxique.'},{e:'📢',t:'Anti-spam',d:'Pas de flood ni de messages répétitifs.'},{e:'🔒',t:'Vie privée',d:'Ne partagez pas d\'infos personnelles.'},{e:'🎫',t:'Tickets',d:'Problème → /ticket pour contacter le staff.'},{e:'⚖️',t:'Modération',d:'Les décisions du staff sont finales.'}];
    const emb=new EmbedBuilder().setTitle('📜 Règles du Serveur').setColor(C('#e74c3c')).setTimestamp().setFooter({text:'Non-respect = sanctions'});
    rules.forEach((r,i)=>emb.addFields({name:`${r.e} ${i+1}. ${r.t}`,value:r.d}));
    return interaction.reply({embeds:[emb]});
  }

  // ══ FUN ══
  const BLAGUES=['Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon ils tomberaient dans le bateau ! 😄','C\'est l\'histoire d\'un homme qui rentre dans une bibliothèque et demande un steak. Le bibliothécaire répond : "Chut !" L\'homme murmure : "Désolé... un steak svp." 🤫','Qu\'est-ce qu\'un crocodile qui surveille des tapis ? Un tapi-coa ! 🐊','Pourquoi l\'épouvantail a-t-il reçu un prix ? Parce qu\'il était exceptionnel dans son domaine ! 🌾','Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ? Un chat-peint de Noël ! 🎨'];
  const CITATIONS=['La vie, c\'est comme une bicyclette, il faut avancer pour ne pas perdre l\'équilibre. — Einstein','Le succès c\'est d\'aller d\'échec en échec sans perdre son enthousiasme. — Churchill','La seule façon de faire du bon travail est d\'aimer ce que vous faites. — Jobs','L\'imagination est plus importante que le savoir. — Einstein','Sois le changement que tu veux voir dans le monde. — Gandhi'];
  const BOULE=['Oui, absolument ! ✅','Tout à fait ! 💯','C\'est certain ! 🎯','Selon moi, oui ! 👍','Les signes pointent vers oui ! 🔮','Réponse floue, réessaie ! 🌫️','Demande encore plus tard... ⏳','Je ne suis pas sûr... 🤔','Je ne me prononce pas ! 🤐','Mes sources disent non ! ❌','Très improbable ! 👎','Non, définitivement ! 🚫'];

  if (cmd==='blague') { return interaction.reply({embeds:[new EmbedBuilder().setTitle('😂 Blague du jour').setDescription(BLAGUES[Math.floor(Math.random()*BLAGUES.length)]).setColor(C('#f0b429')).setTimestamp().setFooter({text:interaction.guild.name})]}); }
  if (cmd==='pile-ou-face') { const res=Math.random()>0.5;return interaction.reply({embeds:[new EmbedBuilder().setTitle('🪙 Pile ou Face ?').setDescription(`C'est... **${res?'PILE 🟡':'FACE ⚪'}** !`).setColor(C(res?'#f0b429':'#8b90a0')).setTimestamp()]}); }
  if (cmd==='des') { const faces=interaction.options.getInteger('faces')||6,result=Math.floor(Math.random()*faces)+1;return interaction.reply({embeds:[new EmbedBuilder().setTitle('🎲 Lancer de dé').setDescription(`Tu lances un dé à **${faces} faces**...\n\n🎲 Résultat : **${result}**`).setColor(C('#9d6fff')).setTimestamp()]}); }
  if (cmd==='choisir') { const opts=interaction.options.getString('options').split('|').map(s=>s.trim()).filter(Boolean);if(!opts.length)return interaction.reply({embeds:[ERR('Au moins une option requise.')],ephemeral:true});const chosen=opts[Math.floor(Math.random()*opts.length)];return interaction.reply({embeds:[new EmbedBuilder().setTitle('🎯 Choix aléatoire').setDescription(`Parmi ${opts.length} options, j'ai choisi :\n\n**→ ${chosen}**`).setColor(C('#10d982')).setTimestamp()]}); }
  if (cmd==='citation') { return interaction.reply({embeds:[new EmbedBuilder().setTitle('💬 Citation du jour').setDescription(`*"${CITATIONS[Math.floor(Math.random()*CITATIONS.length)]}"*`).setColor(C('#4d8fff')).setTimestamp()]}); }
  if (cmd==='8ball') { const q=interaction.options.getString('question'),rep=BOULE[Math.floor(Math.random()*BOULE.length)];return interaction.reply({embeds:[new EmbedBuilder().setTitle('🎱 Boule Magique').addFields({name:'❓ Question',value:q},{name:'🎱 Réponse',value:rep}).setColor(C('#9d6fff')).setTimestamp()]}); }

  if (cmd==='compter') {
    const g=interaction.guild;await g.members.fetch();
    const total=g.memberCount,humans=g.members.cache.filter(m=>!m.user.bot).size,bots=g.members.cache.filter(m=>m.user.bot).size;
    const online=g.members.cache.filter(m=>!m.user.bot&&m.presence?.status==='online').size;
    const idle=g.members.cache.filter(m=>!m.user.bot&&m.presence?.status==='idle').size;
    const dnd=g.members.cache.filter(m=>!m.user.bot&&m.presence?.status==='dnd').size;
    const offline=humans-online-idle-dnd;
    return interaction.reply({embeds:[new EmbedBuilder().setTitle(`📊 Comptage — ${g.name}`).setColor(C('#5865F2')).addFields(
      {name:'👥 Total',value:`**${total}**`,inline:true},{name:'👤 Humains',value:`**${humans}**`,inline:true},{name:'🤖 Bots',value:`**${bots}**`,inline:true},
      {name:'🟢 En ligne',value:`**${online}**`,inline:true},{name:'🟡 Absent',value:`**${idle}**`,inline:true},{name:'🔴 Ne pas déranger',value:`**${dnd}**`,inline:true},
      {name:'⚫ Hors ligne',value:`**${offline}**`,inline:true},{name:'🎤 En vocal',value:`**${Object.keys(db.voiceActive).length}**`,inline:true},
    ).setTimestamp()]});
  }

  // ══ RAPPELS ══
  if (cmd==='rappel') {
    const minutes=interaction.options.getInteger('minutes'),msg=interaction.options.getString('message');
    const time=Date.now()+minutes*60000;
    db.reminders.push({ userId:interaction.user.id, channelId:interaction.channel.id, msg, time });
    const d=minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes}min`;
    return interaction.reply({embeds:[new EmbedBuilder().setTitle('⏰ Rappel créé !').setDescription(`Je te rappellerai dans **${d}** :\n\n*${msg}*`).setColor(C('#10d982')).setTimestamp()],ephemeral:true});
  }

  // ══ ANNIVERSAIRES ══
  if (cmd==='anniversaire') {
    const date=interaction.options.getString('date');
    if (!/^\d{2}\/\d{2}$/.test(date)) return interaction.reply({embeds:[ERR('Format invalide. Utilisez JJ/MM (ex: 25/12).')],ephemeral:true});
    db.birthdays[interaction.user.id]=date;
    return interaction.reply({embeds:[OK('Anniversaire enregistré !',`Ton anniversaire est le **${date}** 🎂\nTe recevras une mention et 100 points ce jour-là !`)],ephemeral:true});
  }

  if (cmd==='prochains-anniversaires') {
    const today=new Date();
    const upcoming=Object.entries(db.birthdays).map(([id,d])=>{
      const[day,month]=d.split('/').map(Number);
      const next=new Date(today.getFullYear(),month-1,day);
      if(next<today)next.setFullYear(today.getFullYear()+1);
      const days=Math.ceil((next-today)/(1000*60*60*24));
      return{id,date:d,days};
    }).sort((a,b)=>a.days-b.days).slice(0,10);
    const emb=new EmbedBuilder().setTitle('🎂 Prochains anniversaires').setColor(C('#f0b429')).setTimestamp();
    if(!upcoming.length)emb.setDescription('Aucun anniversaire enregistré. Utilisez `/anniversaire`.');
    else upcoming.forEach(({id,date,days})=>emb.addFields({name:`<@${id}>`,value:`📅 ${date} — Dans **${days} jour${days>1?'s':''}**`,inline:false}));
    return interaction.reply({embeds:[emb]});
  }

  // ══ STATS VOCAUX ══
  if (cmd==='stats-vocaux') {
    const t=interaction.options.getUser('membre')||interaction.user;
    const vs=db.voiceStats[t.id]||{totalMinutes:0,sessions:0};
    const h=Math.floor(vs.totalMinutes/60),m=vs.totalMinutes%60;
    const isActive=!!db.voiceActive[t.id];
    const bar=n=>{const p=Math.min(Math.round(n/10)*10,100);const f=Math.floor(p/10);return '█'.repeat(f)+'░'.repeat(10-f)+` ${p}%`;};
    return interaction.reply({embeds:[new EmbedBuilder().setTitle(`🎤 Stats Vocaux — ${t.username}`).setThumbnail(t.displayAvatarURL({dynamic:true})).setColor(C('#9d6fff')).addFields(
      {name:'⏱️ Temps total',value:`**${h}h ${m}min**`,inline:true},
      {name:'🔗 Sessions',value:`**${vs.sessions}**`,inline:true},
      {name:'📍 Statut',value:isActive?'🟢 **En vocal maintenant**':'⚫ Hors vocal',inline:true},
      {name:'📊 Activité',value:bar(Math.min(vs.totalMinutes/6,100)),inline:false},
    ).setTimestamp()]});
  }

  if (cmd==='classement-vocal') {
    const top=Object.entries(db.voiceStats).sort(([,a],[,b])=>b.totalMinutes-a.totalMinutes).slice(0,10);
    const medals=['🥇','🥈','🥉'];
    const emb=new EmbedBuilder().setTitle('🎤 Classement Temps Vocal').setColor(C('#9d6fff')).setTimestamp();
    if(!top.length)emb.setDescription('Aucune donnée vocale.');
    else top.forEach(([id,vs],i)=>{const h=Math.floor(vs.totalMinutes/60),m=vs.totalMinutes%60;emb.addFields({name:`${medals[i]||`**${i+1}.**`} <@${id}>`,value:`⏱️ **${h}h ${m}min** • ${vs.sessions} session(s)`,inline:false});});
    return interaction.reply({embeds:[emb]});
  }

  if (cmd==='vocal-live') {
    const g=interaction.guild;
    const voiceChannels=g.channels.cache.filter(c=>c.type===ChannelType.GuildVoice);
    const emb=new EmbedBuilder().setTitle('🔴 Membres en vocal maintenant').setColor(C('#ff4d4d')).setTimestamp();
    let total=0;
    const fields=[];
    voiceChannels.forEach(vc=>{
      const members=vc.members.filter(m=>!m.user.bot);
      if(!members.size)return;
      total+=members.size;
      fields.push({name:`🔊 ${vc.name} (${members.size})`,value:members.map(m=>`${m.user.username}${m.voice.selfMute?'🔇':m.voice.selfDeaf?'🔕':''}`).join('\n')||'—',inline:true});
    });
    if(!fields.length)emb.setDescription('Aucun membre en vocal actuellement.');
    else{emb.setDescription(`**${total} membre${total>1?'s':''} en vocal** sur ${voiceChannels.size} salon${voiceChannels.size>1?'s':''}`);fields.forEach(f=>emb.addFields(f));}
    return interaction.reply({embeds:[emb]});
  }

  // ══ CANDIDATURES ══
  if (cmd==='postuler') {
    const modal=new ModalBuilder().setCustomId('app_modal').setTitle('📝 Candidature Staff');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q1').setLabel('Pourquoi rejoindre l\'équipe ?').setStyle(TextInputStyle.Paragraph).setMinLength(30).setMaxLength(500).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q2').setLabel('Ton expérience ?').setStyle(TextInputStyle.Paragraph).setMinLength(20).setMaxLength(300).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q3').setLabel('Disponibilité par semaine ?').setStyle(TextInputStyle.Short).setRequired(true))
    );
    return interaction.showModal(modal);
  }

  if (cmd==='candidatures') {
    if(!db.applications.length)return interaction.reply({embeds:[INF('Candidatures','Aucune.')],ephemeral:true});
    return interaction.reply({embeds:[new EmbedBuilder().setTitle(`📋 Candidatures (${db.applications.length})`).setColor(C('#f0b429')).setDescription(db.applications.map((a,i)=>`**${i+1}.** ${a.username} — ${a.status} — ${a.date}`).join('\n')).setTimestamp()],ephemeral:true});
  }

  if (cmd==='rapport') {
    await interaction.deferReply();
    const g=interaction.guild;await g.fetch();
    const topEco=Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,3).map(([id,d],i)=>`${['🥇','🥈','🥉'][i]} <@${id}> — ${d.points} pts`).join('\n')||'Aucun';
    const topVoice=Object.entries(db.voiceStats).sort(([,a],[,b])=>b.totalMinutes-a.totalMinutes).slice(0,3).map(([id,vs],i)=>{const h=Math.floor(vs.totalMinutes/60),m=vs.totalMinutes%60;return`${['🥇','🥈','🥉'][i]} <@${id}> — ${h}h${m}min`;}).join('\n')||'Aucun';
    const totalWarns=Object.values(db.warns).reduce((s,w)=>s+w.length,0);
    return interaction.editReply({embeds:[new EmbedBuilder().setTitle(`📑 Rapport Complet — ${g.name}`).setColor(C('#f0b429')).addFields(
      {name:'👥 Membres',value:`${g.memberCount}`,inline:true},
      {name:'📦 Articles boutique',value:`${db.articles.length}`,inline:true},
      {name:'⚡ Cmds custom',value:`${Object.keys(db.customCmds).length}`,inline:true},
      {name:'🎫 Tickets ouverts',value:`${Object.keys(db.ticketMap).length}`,inline:true},
      {name:'⚠️ Warns total',value:`${totalWarns}`,inline:true},
      {name:'🎤 Membres en vocal',value:`${Object.keys(db.voiceActive).length}`,inline:true},
      {name:'🏆 Top Économie',value:topEco,inline:false},
      {name:'🎤 Top Vocal',value:topVoice,inline:false},
    ).setTimestamp().setFooter({text:`Rapport généré le ${new Date().toLocaleString('fr-FR')}`})]});
  }
});

// ═══════════════════════════════════════════════════════════════════
// ─── EXPRESS + API REST PANEL (TOUTES LES ROUTES) ───────────────
// ═══════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());

// ── CORS — autoriser GitHub Pages et tous les origines du panel ──
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function authPanel(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) { res.setHeader('WWW-Authenticate','Basic realm="NexusBot Panel"'); return res.status(401).json({ error:'Non autorisé' }); }
  const [,encoded] = auth.split(' ');
  const pass = Buffer.from(encoded,'base64').toString().split(':').slice(1).join(':');
  if (pass !== PANEL_PASSWORD) return res.status(403).json({ error:'Mot de passe incorrect' });
  next();
}

// Panel statique
app.use('/admin', authPanel, express.static(path.join(__dirname,'public')));

// ── Status & Stats ────────────────────────────────────────────
app.get('/api/status', authPanel, (req, res) => {
  const guild = client.guilds.cache.get(GUILD_ID);
  res.json({
    online:      !!client.user,
    tag:         client.user?.tag||'Non connecté',
    ping:        client.ws.ping,
    uptime:      client.uptime,
    guildName:   guild?.name||'—',
    memberCount: guild?.memberCount||0,
    customCmds:  Object.keys(db.customCmds).length,
    articles:    db.articles.length,
    tickets:     Object.keys(db.ticketMap).length,
    voiceActive: Object.keys(db.voiceActive).length,
  });
});

app.get('/api/stats', authPanel, async (req, res) => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch();
    const totalWarns = Object.values(db.warns).reduce((s,w)=>s+w.length,0);
    const online = guild.members.cache.filter(m=>!m.user.bot&&m.presence?.status&&m.presence.status!=='offline').size;
    const bots = guild.members.cache.filter(m=>m.user.bot).map(b=>({username:b.user.username,id:b.id}));
    res.json({
      members:     guild.memberCount,
      online,
      channels:    guild.channels.cache.size,
      roles:       guild.roles.cache.size,
      articles:    db.articles.length,
      customCmds:  Object.keys(db.customCmds).length,
      tickets:     Object.keys(db.ticketMap).length,
      giveaways:   Object.values(db.giveaways).filter(g=>!g.ended).length,
      economy:     Object.keys(db.economy).length,
      totalWarns,
      voiceActive: Object.keys(db.voiceActive).length,
      bots,
      topPoints:   Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,5).map(([id,d])=>({id,points:d.points,level:d.level})),
    });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/logs', authPanel, (req, res) => res.json(db.panelLogs.slice(0,100)));

// ── Membres ───────────────────────────────────────────────────
app.get('/api/member/:userId', authPanel, async (req, res) => {
  try {
    const guild  = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(req.params.userId);
    const u      = getUser(member.id);
    const vs     = db.voiceStats[member.id]||{totalMinutes:0,sessions:0};
    res.json({
      id:           member.id,
      username:     member.user.username,
      avatar:       member.user.displayAvatarURL({dynamic:true}),
      roles:        member.roles.cache.filter(r=>r.id!==guild.id).map(r=>r.name),
      joinedAt:     member.joinedAt?.toLocaleDateString('fr-FR'),
      points:       u.points,
      level:        u.level,
      warns:        db.warns[member.id]||[],
      voiceMinutes: vs.totalMinutes,
      rep:          getRep(member.id).total,
    });
  } catch(e) { res.status(404).json({ error:'Membre introuvable' }); }
});

// ── Bans ──────────────────────────────────────────────────────
app.get('/api/bans', authPanel, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const bans  = await guild.bans.fetch();
    res.json(bans.map(b=>({ user:{ id:b.user.id, username:b.user.username }, reason:b.reason })));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Commandes custom ──────────────────────────────────────────
app.get('/api/cmds', authPanel, (req, res) => res.json(Object.entries(db.customCmds).map(([name,data])=>({name,...data}))));

app.post('/api/cmds', authPanel, (req, res) => {
  const { name, desc, reponse, code, type, color, ephemeral } = req.body;
  if (!name) return res.status(400).json({ error:'Nom requis' });
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'');
  if (!safeName) return res.status(400).json({ error:'Nom invalide' });
  db.customCmds[safeName] = { desc:desc||'', reponse:reponse||'', code:code||'', type:type||'text', color:color||'#f0b429', ephemeral:!!ephemeral, updatedAt:new Date().toLocaleString('fr-FR') };
  log(`⚡ Commande custom : /${safeName}`);
  res.json({ ok:true, name:safeName, cmd:db.customCmds[safeName] });
});

app.delete('/api/cmds/:name', authPanel, (req, res) => {
  const name = req.params.name.toLowerCase();
  if (!db.customCmds[name]) return res.status(404).json({ error:'Commande introuvable' });
  delete db.customCmds[name];
  log(`🗑️ Commande custom supprimée : /${name}`);
  res.json({ ok:true, deleted:name });
});

// ── Articles ──────────────────────────────────────────────────
app.get('/api/articles', authPanel, (req, res) => res.json(db.articles));

app.post('/api/articles', authPanel, (req, res) => {
  const { name, price, link, description, emoji, category, stock, image } = req.body;
  if (!name||!price) return res.status(400).json({ error:'Nom et prix requis' });
  const article = { id:Date.now(), name, price, link:link||'', description:description||'', emoji:emoji||'🛒', category:category||'', stock:stock??-1, image:image||'', visible:true, createdAt:new Date().toLocaleString('fr-FR') };
  db.articles.push(article);
  log(`🛒 Article ajouté: ${name}`);
  res.json({ ok:true, article });
});

app.delete('/api/articles/:id', authPanel, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = db.articles.findIndex(a=>a.id===id);
  if (idx<0) return res.status(404).json({ error:'Article introuvable' });
  const deleted = db.articles.splice(idx,1)[0];
  log(`🗑️ Article supprimé: ${deleted.name}`);
  res.json({ ok:true, deleted });
});

app.put('/api/articles/:id', authPanel, (req, res) => {
  const id = parseInt(req.params.id);
  const art = db.articles.find(a=>a.id===id);
  if (!art) return res.status(404).json({ error:'Article introuvable' });
  Object.assign(art, req.body, { id });
  res.json({ ok:true, article:art });
});

// ── Shop config ───────────────────────────────────────────────
app.get('/api/shop-config', authPanel, (req, res) => res.json(db.shopConfig));
app.post('/api/shop-config', authPanel, (req, res) => {
  const { name, color, footer, description, banner } = req.body;
  if (name) db.shopConfig.name=name;
  if (color) db.shopConfig.color=color;
  if (footer) db.shopConfig.footer=footer;
  if (description) db.shopConfig.description=description;
  if (banner) db.shopConfig.banner=banner;
  res.json({ ok:true, config:db.shopConfig });
});

// ── Annonce ───────────────────────────────────────────────────
app.post('/api/announce', authPanel, async (req, res) => {
  const { channelId, title, message, color, mention } = req.body;
  if (!channelId||!message) return res.status(400).json({ error:'channelId et message requis' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const ch    = guild?.channels.cache.get(channelId);
    if (!ch) return res.status(404).json({ error:'Channel introuvable' });
    const emb = new EmbedBuilder().setTitle(title||'📢 Annonce').setDescription(message).setColor(C(color||'#5865F2')).setTimestamp().setFooter({ text:'Panel NexusBot' });
    await ch.send({ content:mention||undefined, embeds:[emb] });
    log(`📢 Annonce → #${ch.name}`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── STATS CHANNELS (panel web) ────────────────────────────────
app.post('/api/stats-channels', authPanel, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return res.status(500).json({ error: 'Serveur introuvable' });
    await guild.members.fetch();

    const { catName='📊 ── STATISTIQUES ──', membres=true, humains=true, bots=true, enligne=true, vocal=true, tickets=false, articles=false } = req.body;

    const total   = guild.memberCount;
    const humans  = guild.members.cache.filter(m => !m.user.bot).size;
    const nBots   = guild.members.cache.filter(m => m.user.bot).size;
    const online  = guild.members.cache.filter(m => !m.user.bot && m.presence?.status && m.presence.status !== 'offline').size;
    const inVoice = Object.keys(db.voiceActive||{}).length;

    // Supprimer anciens salons si existent
    const sc = db.statsChannels;
    const oldIds = [sc.membersId,sc.humansId,sc.botsId,sc.onlineId,sc.voiceId,sc.ticketsId,sc.articlesId,sc.categoryId].filter(Boolean);
    for (const id of oldIds) { const ch=guild.channels.cache.get(id); if(ch) await ch.delete().catch(()=>{}); }

    const category = await guild.channels.create({
      name: catName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages] }],
    });

    const makeVC = async (name) => {
      await new Promise(r => setTimeout(r, 1200)); // délai anti-rate-limit
      return guild.channels.create({
        name, type: ChannelType.GuildVoice, parent: category.id,
        permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] }],
      });
    };

    const created = { categoryId: category.id };
    let count = 0;

    if (membres)  { const ch = await makeVC(`👥 Membres : ${total}`);   created.membersId   = ch.id; count++; }
    if (humains)  { const ch = await makeVC(`👤 Humains : ${humans}`);  created.humansId    = ch.id; count++; }
    if (bots)     { const ch = await makeVC(`🤖 Bots : ${nBots}`);      created.botsId      = ch.id; count++; }
    if (enligne)  { const ch = await makeVC(`🟢 En ligne : ${online}`); created.onlineId    = ch.id; count++; }
    if (vocal)    { const ch = await makeVC(`🎤 Vocal : ${inVoice}`);   created.voiceId     = ch.id; count++; }
    if (tickets)  { const ch = await makeVC(`🎫 Tickets : ${Object.keys(db.ticketMap||{}).length}`); created.ticketsId = ch.id; count++; }
    if (articles) { const ch = await makeVC(`📦 Articles : ${db.articles.length}`); created.articlesId = ch.id; count++; }

    db.statsChannels = created;
    log(`📊 ${count} salon(s) stats créés via panel`);
    res.json({ ok: true, count });
  } catch(e) {
    log(`❌ Erreur stats-channels: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/stats-channels', authPanel, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const sc = db.statsChannels;
    const ids = [sc.membersId,sc.humansId,sc.botsId,sc.onlineId,sc.voiceId,sc.ticketsId,sc.articlesId,sc.categoryId].filter(Boolean);
    let deleted = 0;
    for (const id of ids) { const ch=guild?.channels.cache.get(id); if(ch){await ch.delete().catch(()=>{});deleted++;} }
    db.statsChannels = {};
    res.json({ ok:true, deleted });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/stats-channels-info', authPanel, (req, res) => {
  res.json({ active: db.statsChannels || {} });
});

// ── ARTICLES — mise à jour stock ──────────────────────────────
app.put('/api/articles/:id', authPanel, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = db.articles.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Article introuvable' });
  Object.assign(db.articles[idx], req.body);
  log(`✏️ Article #${id} modifié`);
  res.json({ ok: true, article: db.articles[idx] });
});

app.post('/api/articles/:id/stock', authPanel, (req, res) => {
  const id = parseInt(req.params.id);
  const art = db.articles.find(a => a.id === id);
  if (!art) return res.status(404).json({ error: 'Article introuvable' });
  const { stock, reason } = req.body;
  if (stock === undefined || stock === null) return res.status(400).json({ error: 'stock requis' });
  art.stock = parseInt(stock);
  log(`📦 Stock article "${art.name}" → ${art.stock} (${reason||'—'})`);
  res.json({ ok: true, stock: art.stock });
});

app.delete('/api/articles/:id', authPanel, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = db.articles.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Article introuvable' });
  const [removed] = db.articles.splice(idx, 1);
  log(`🗑️ Article supprimé: ${removed.name}`);
  res.json({ ok: true });
});

// ── LIVRAISON — test envoi ────────────────────────────────────
app.post('/api/delivery/test', authPanel, async (req, res) => {
  try {
    const { userId, template } = req.body;
    if (!userId || !template) return res.status(400).json({ error: 'userId et template requis' });
    const guild = client.guilds.cache.get(GUILD_ID);
    const member = guild?.members.cache.get(userId) || await guild?.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: 'Membre introuvable sur ce serveur' });

    // Remplacer les variables
    let content = template.content || '';
    const vars = { '{acheteur}': member.user.username, '{date}': new Date().toLocaleDateString('fr-FR'), '{article}': template.article || 'Article Test', '{prix}': '0.00€', '{commande_id}': 'TEST-001', '{serveur}': guild.name };
    Object.entries(vars).forEach(([k,v]) => { content = content.split(k).join(v); });

    // Watermark
    if (template.watermark) content += `\n\n━━━━━━━━━━━━━━━━━━\n🔒 Livré à : ${member.user.username} (${userId})\n━━━━━━━━━━━━━━━━━━`;

    const fmt = template.format || 'txt';
    const mime = fmt==='html'?'text/html':fmt==='md'?'text/markdown':'text/plain';
    const buf = Buffer.from(content, 'utf-8');
    const attachment = new AttachmentBuilder(buf, { name: `livraison-test.${fmt}`, contentType: mime });

    const dmMsg = template.dm || '✅ Ceci est un test de livraison NexusBot !';
    await member.user.send({ content: dmMsg, files: [attachment] });
    log(`📄 Livraison test envoyée à ${member.user.username}`);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Config modération ─────────────────────────────────────────
app.post('/api/mod-config', authPanel, (req, res) => {
  Object.assign(db.modConfig, req.body);
  log('⚙️ Config modération mise à jour');
  res.json({ ok:true });
});

// ════════════════════════════════════════════════════════════════
//  COMMANDES / ORDERS
// ════════════════════════════════════════════════════════════════

// Lister toutes les commandes
app.get('/api/orders', authPanel, (req, res) => {
  res.json({ ok:true, orders: db.orders || [] });
});

// Créer une commande (depuis NexusStore ou panel)
app.post('/api/orders', authPanel, async (req, res) => {
  const { userId, discordId, username, articleId, articleName, price, notes } = req.body;
  if (!articleName || !price) return res.status(400).json({ error:'articleName et price requis' });
  const order = {
    id:          'CMD-' + String(db.orders.length + 1).padStart(4,'0'),
    userId:      userId || discordId || '',
    discordId:   discordId || userId || '',
    username:    username || 'Inconnu',
    articleId:   articleId || null,
    articleName: articleName,
    price:       price,
    status:      'pending',
    date:        new Date().toLocaleDateString('fr-FR'),
    dateISO:     new Date().toISOString(),
    notes:       notes || '',
  };
  db.orders.push(order);
  // Décrémenter le stock si article bot
  if (articleId) {
    const art = db.articles.find(a => a.id == articleId);
    if (art && art.stock > 0) art.stock--;
  }
  // Notifier le staff via CH_SALES si défini
  const salCh = client.channels.cache.get(process.env.CH_SALES || '');
  if (salCh) {
    await salCh.send({ embeds: [new EmbedBuilder()
      .setTitle('🛒 Nouvelle commande !')
      .setColor(C('#10d982'))
      .addFields(
        { name:'🔖 ID',      value: order.id,          inline: true },
        { name:'👤 Client',  value: username||'Inconnu',inline: true },
        { name:'📦 Article', value: articleName,        inline: true },
        { name:'💰 Prix',    value: price,              inline: true },
      )
      .setTimestamp()
    ]}).catch(()=>{});
  }
  log(`🛒 Commande ${order.id} créée — ${articleName} — ${username}`);
  res.json({ ok:true, order });
});

// Modifier le statut d'une commande
app.put('/api/orders/:id', authPanel, async (req, res) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error:'Commande introuvable' });
  const { status, notes } = req.body;
  if (status) order.status = status;
  if (notes !== undefined) order.notes = notes;
  // Notifier le client en DM si status change
  if (status && order.discordId) {
    const statusLabel = { pending:'⏳ En attente', confirmed:'✅ Confirmée', delivered:'📦 Livrée !', cancelled:'❌ Annulée', refunded:'💸 Remboursée' };
    const user = await client.users.fetch(order.discordId).catch(()=>null);
    if (user) {
      await user.send({ embeds: [new EmbedBuilder()
        .setTitle('📦 Mise à jour de ta commande')
        .setColor(C(status==='delivered'?'#10d982':status==='cancelled'?'#ff4d4d':'#5865F2'))
        .setDescription(`Ta commande **${order.id}** a été mise à jour !`)
        .addFields(
          { name:'📦 Article', value: order.articleName, inline:true },
          { name:'📊 Statut',  value: statusLabel[status]||status, inline:true },
        )
        .setFooter({ text:'Pour toute question → /macommande '+order.id })
        .setTimestamp()
      ]}).catch(()=>{});
    }
  }
  log(`📦 Commande ${order.id} → ${status}`);
  res.json({ ok:true, order });
});

// Supprimer une commande
app.delete('/api/orders/:id', authPanel, (req, res) => {
  const idx = db.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error:'Introuvable' });
  const [removed] = db.orders.splice(idx, 1);
  log(`🗑️ Commande ${removed.id} supprimée`);
  res.json({ ok:true });
});

// ════════════════════════════════════════════════════════════════
//  GIVEAWAYS — Gestion depuis le panel
// ════════════════════════════════════════════════════════════════

app.get('/api/giveaways', authPanel, (req, res) => {
  const list = Object.entries(db.giveaways).map(([id, gw]) => ({
    id, prize: gw.prize, end: gw.end, ended: gw.ended,
    entries: gw.entries ? [...gw.entries].length : 0,
    winner: gw.winner || null,
    channelId: gw.channel,
    winners: gw.winners || 1,
  }));
  res.json({ ok:true, giveaways: list });
});

app.post('/api/giveaways', authPanel, async (req, res) => {
  try {
    const { channelId, prize, minutes, winners=1 } = req.body;
    if (!channelId || !prize || !minutes) return res.status(400).json({ error:'channelId, prize, minutes requis' });
    const guild = client.guilds.cache.get(GUILD_ID);
    const ch    = guild?.channels.cache.get(channelId);
    if (!ch) return res.status(404).json({ error:'Salon introuvable' });
    const end = Date.now() + minutes * 60 * 1000;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gw_join').setLabel('🎉 Participer').setStyle(ButtonStyle.Primary)
    );
    const msg = await ch.send({ embeds: [new EmbedBuilder()
      .setTitle('🎉 GIVEAWAY')
      .setDescription(`**🏆 Prix :** ${prize}\n\n⏱️ **Fin :** ${new Date(end).toLocaleString('fr-FR')}\n🏅 **Gagnants :** ${winners}\n👥 **Participants :** 0\n\nClique sur le bouton pour participer !`)
      .setColor(C('#f0b429'))
      .setTimestamp(new Date(end))
      .setFooter({ text:'Giveaway créé depuis le panel admin' })
    ], components:[row] });
    db.giveaways[msg.id] = { prize, end, channel:channelId, entries:new Set(), ended:false, winners };
    log(`🎉 Giveaway créé depuis panel: ${prize} dans #${ch.name}`);
    res.json({ ok:true, messageId:msg.id, channelId, prize });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/giveaways/:id/end', authPanel, async (req, res) => {
  const guild = client.guilds.cache.get(GUILD_ID);
  await endGiveaway(req.params.id, guild).catch(()=>{});
  res.json({ ok:true });
});

app.post('/api/giveaways/:id/reroll', authPanel, async (req, res) => {
  const gw = db.giveaways[req.params.id];
  if (!gw) return res.status(404).json({ error:'Giveaway introuvable' });
  const entries = [...(gw.entries||new Set())];
  if (!entries.length) return res.status(400).json({ error:'Aucun participant' });
  const winner = entries[Math.floor(Math.random()*entries.length)];
  gw.winner = winner;
  const ch = client.channels.cache.get(gw.channel);
  if (ch) await ch.send({ embeds:[new EmbedBuilder().setTitle('🔄 Nouveau Gagnant !').setDescription(`**Prix :** ${gw.prize}\n**Gagnant :** <@${winner}>`).setColor(C('#10d982')).setTimestamp()] }).catch(()=>{});
  res.json({ ok:true, winner });
});

app.delete('/api/giveaways/:id', authPanel, (req, res) => {
  if (!db.giveaways[req.params.id]) return res.status(404).json({ error:'Introuvable' });
  delete db.giveaways[req.params.id];
  res.json({ ok:true });
});

// ════════════════════════════════════════════════════════════════
//  MESSAGE DE BIENVENUE — Éditeur
// ════════════════════════════════════════════════════════════════

app.get('/api/welcome', authPanel, (req, res) => {
  res.json({ ok:true, config: db.welcomeConfig });
});

app.post('/api/welcome', authPanel, async (req, res) => {
  const { enabled, channelId, message, title, color, showAvatar, showBanner, footerText, imageUrl } = req.body;
  if (enabled !== undefined) db.welcomeConfig.enabled = enabled;
  if (channelId)    db.welcomeConfig.channelId  = channelId;
  if (message)      db.welcomeConfig.message     = message;
  if (title)        db.welcomeConfig.title        = title;
  if (color)        db.welcomeConfig.color        = color;
  if (showAvatar !== undefined) db.welcomeConfig.showAvatar = showAvatar;
  if (showBanner !== undefined) db.welcomeConfig.showBanner = showBanner;
  if (footerText)   db.welcomeConfig.footerText   = footerText;
  if (imageUrl)     db.welcomeConfig.imageUrl      = imageUrl;
  log('👋 Config bienvenue mise à jour');
  res.json({ ok:true, config: db.welcomeConfig });
});

// Test message de bienvenue
app.post('/api/welcome/test', authPanel, async (req, res) => {
  try {
    const guild  = client.guilds.cache.get(GUILD_ID);
    const cfg    = db.welcomeConfig;
    const ch     = guild?.channels.cache.get(cfg.channelId || req.body.channelId);
    if (!ch) return res.status(404).json({ error:'Salon bienvenue introuvable. Configurez CH_WELCOME dans Railway.' });
    const member = guild.members.cache.get(req.body.userId || client.user.id) || guild.me;
    const user   = member?.user || client.user;
    const msg    = (cfg.message||'👋 Bienvenue **{user}** sur **{server}** !')
      .replace(/{user}/g, user.username)
      .replace(/{server}/g, guild.name)
      .replace(/{count}/g, guild.memberCount)
      .replace(/{mention}/g, `<@${user.id}>`);
    const emb = new EmbedBuilder()
      .setDescription(msg)
      .setColor(C(cfg.color||'#5865F2'))
      .setTimestamp();
    if (cfg.title) emb.setTitle(cfg.title.replace(/{user}/g, user.username).replace(/{server}/g, guild.name));
    if (cfg.showAvatar !== false) emb.setThumbnail(user.displayAvatarURL({ dynamic:true }));
    if (cfg.imageUrl)  emb.setImage(cfg.imageUrl);
    if (cfg.footerText) emb.setFooter({ text: cfg.footerText.replace(/{server}/g, guild.name) });
    await ch.send({ content:`🧪 **TEST** — Voici à quoi ressemblera le message de bienvenue :`, embeds:[emb] });
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ════════════════════════════════════════════════════════════════
//  PAGE À PROPOS
// ════════════════════════════════════════════════════════════════

app.get('/api/about', authPanel, (req, res) => {
  res.json({ ok:true, about: db.aboutPage || {} });
});

app.post('/api/about', authPanel, (req, res) => {
  Object.assign(db.aboutPage, req.body);
  log('📝 Page À propos mise à jour');
  res.json({ ok:true, about: db.aboutPage });
});

// ── Actions modération ────────────────────────────────────────
app.post('/api/mod/warn', authPanel, async (req, res) => {
  const { userId, reason } = req.body;
  if (!userId||!reason) return res.status(400).json({ error:'userId et reason requis' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(userId);
    if (!db.warns[userId]) db.warns[userId]=[];
    db.warns[userId].push({ reason, modId:'panel', date:new Date().toLocaleString('fr-FR') });
    const total = db.warns[userId].length;
    if (db.modConfig.dm) member.send({ embeds:[new EmbedBuilder().setTitle('⚠️ Avertissement').setDescription(`**Serveur :** ${guild.name}\n**Raison :** ${reason}\n**Total :** ${total} warn(s)`).setColor(C('#f0b429')).setTimestamp()] }).catch(()=>{});
    if (CH_LOGS) { const ch=guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('⚠️ Warn — Panel').setColor(C('#f0b429')).addFields({name:'Membre',value:`<@${userId}>`},{name:'Raison',value:reason},{name:'Total',value:`${total}`}).setTimestamp()] }); }
    if (db.modConfig.autosanction && total >= 3) { member.timeout(10*60000,'Auto-mod: 3 warns').catch(()=>{}); }
    log(`⚠️ Warn panel: ${member.user.username}`);
    res.json({ ok:true, total });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/mute', authPanel, async (req, res) => {
  const { userId, minutes, reason } = req.body;
  if (!userId) return res.status(400).json({ error:'userId requis' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(userId);
    await member.timeout((minutes||10)*60000, reason||'Panel admin');
    if (db.modConfig.dm) member.send({ embeds:[new EmbedBuilder().setTitle('🔇 Sourdine').setDescription(`**Durée :** ${minutes||10} min\n**Raison :** ${reason||'Panel'}`).setColor(C('#4d8fff')).setTimestamp()] }).catch(()=>{});
    if (CH_LOGS) { const ch=guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🔇 Mute — Panel').setColor(C('#4d8fff')).addFields({name:'Membre',value:`<@${userId}>`},{name:'Durée',value:`${minutes||10} min`},{name:'Raison',value:reason||'Panel'}).setTimestamp()] }); }
    log(`🔇 Mute panel: ${member.user.username} ${minutes}min`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/kick', authPanel, async (req, res) => {
  const { userId, reason } = req.body;
  if (!userId) return res.status(400).json({ error:'userId requis' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(userId);
    if (!member.kickable) return res.status(403).json({ error:'Impossible d\'expulser ce membre' });
    if (db.modConfig.dm) member.send({ embeds:[new EmbedBuilder().setTitle('👢 Expulsé').setDescription(`**Serveur :** ${guild.name}\n**Raison :** ${reason||'Panel'}`).setColor(C('#ff4d4d')).setTimestamp()] }).catch(()=>{});
    await member.kick(reason||'Panel admin');
    if (CH_LOGS) { const ch=guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('👢 Kick — Panel').setColor(C('#ff4d4d')).addFields({name:'Membre',value:member.user.username},{name:'Raison',value:reason||'Panel'}).setTimestamp()] }); }
    log(`👢 Kick panel: ${member.user.username}`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/ban', authPanel, async (req, res) => {
  const { userId, reason, days } = req.body;
  if (!userId) return res.status(400).json({ error:'userId requis' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(()=>null);
    if (member) {
      if (!member.bannable) return res.status(403).json({ error:'Impossible de bannir ce membre' });
      if (db.modConfig.dm) member.send({ embeds:[new EmbedBuilder().setTitle('🔨 Banni').setDescription(`**Serveur :** ${guild.name}\n**Raison :** ${reason||'Panel'}`).setColor(C('#ff4d4d')).setTimestamp()] }).catch(()=>{});
    }
    await guild.members.ban(userId, { reason:reason||'Panel admin', deleteMessageDays:days||0 });
    if (CH_LOGS) { const ch=guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🔨 Ban — Panel').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`<@${userId}>`},{name:'Raison',value:reason||'Panel'}).setTimestamp()] }); }
    log(`🔨 Ban panel: ${userId}`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/unban', authPanel, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error:'userId requis' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    await guild.members.unban(userId);
    log(`🔓 Unban panel: ${userId}`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/clearwarns', authPanel, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error:'userId requis' });
  db.warns[userId]=[];
  log(`🗑️ Warns effacés: ${userId}`);
  res.json({ ok:true });
});

app.post('/api/mod/clear', authPanel, async (req, res) => {
  const { channelId, amount } = req.body;
  if (!channelId) return res.status(400).json({ error:'channelId requis' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const ch = guild.channels.cache.get(channelId);
    if (!ch) return res.status(404).json({ error:'Salon introuvable' });
    const deleted = await ch.bulkDelete(Math.min(amount||10,100), true);
    log(`🗑️ Clear panel: ${deleted.size} messages dans #${ch.name}`);
    res.json({ ok:true, deleted:deleted.size });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/lock', authPanel, async (req, res) => {
  const { channelId, lock } = req.body;
  if (!channelId) return res.status(400).json({ error:'channelId requis' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const ch = guild.channels.cache.get(channelId);
    if (!ch) return res.status(404).json({ error:'Salon introuvable' });
    await ch.permissionOverwrites.edit(guild.id, { SendMessages:lock?false:null });
    log(`${lock?'🔒':'🔓'} ${lock?'Lock':'Unlock'} panel: #${ch.name}`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/slowmode', authPanel, async (req, res) => {
  const { channelId, seconds } = req.body;
  if (!channelId) return res.status(400).json({ error:'channelId requis' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const ch = guild.channels.cache.get(channelId);
    if (!ch) return res.status(404).json({ error:'Salon introuvable' });
    await ch.setRateLimitPerUser(seconds||0);
    log(`🐌 Slowmode panel: #${ch.name} — ${seconds}s`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/lockdown', authPanel, async (req, res) => {
  const { message } = req.body;
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const channels = guild.channels.cache.filter(c=>c.type===ChannelType.GuildText);
    let count = 0;
    for (const [,ch] of channels) {
      try {
        await ch.permissionOverwrites.edit(guild.id, { SendMessages:false });
        if (message) await ch.send({ embeds:[new EmbedBuilder().setTitle('🚨 LOCKDOWN').setDescription(message||'🚨 Le serveur est en lockdown. Merci de patienter.').setColor(C('#ff4d4d')).setTimestamp()] });
        count++;
      } catch(e) {}
    }
    log(`🚨 LOCKDOWN activé — ${count} salons verrouillés`);
    res.json({ ok:true, locked:count });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Stats vocaux ──────────────────────────────────────────────
app.get('/api/voice-stats', authPanel, (req, res) => {
  const stats = Object.entries(db.voiceStats)
    .sort(([,a],[,b])=>b.totalMinutes-a.totalMinutes)
    .slice(0,20)
    .map(([id,vs])=>({ id, ...vs, isActive:!!db.voiceActive[id] }));
  res.json({ stats, active:db.voiceActive });
});

app.get('/api/voice-live', authPanel, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const voiceChannels = guild.channels.cache.filter(c=>c.type===ChannelType.GuildVoice);
    const result = [];
    voiceChannels.forEach(vc => {
      const members = vc.members.filter(m=>!m.user.bot);
      if (!members.size) return;
      result.push({
        channelId:   vc.id,
        channelName: vc.name,
        members:     members.map(m=>({ id:m.id, username:m.user.username, muted:m.voice.selfMute, deafened:m.voice.selfDeaf })),
      });
    });
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Validation code ───────────────────────────────────────────
app.post('/api/exec', authPanel, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error:'Code requis' });
  const errors=[],warnings=[];
  const opens=(code.match(/\{/g)||[]).length,closes=(code.match(/\}/g)||[]).length;
  if (opens!==closes) errors.push(`Accolades non balancées ({: ${opens}, }: ${closes})`);
  const po=(code.match(/\(/g)||[]).length,pc=(code.match(/\)/g)||[]).length;
  if (po!==pc) errors.push(`Parenthèses non balancées (: ${po}, ): ${pc})`);
  if (!code.includes('interaction.reply')&&!code.includes('interaction.editReply')) warnings.push('Aucun interaction.reply() détecté');
  if (code.includes('process.env')) errors.push('process.env interdit dans le code custom');
  if (code.includes('require(')) errors.push('require() interdit dans le code custom');
  res.json({ ok:errors.length===0, errors, warnings, lines:code.split('\n').length, chars:code.length });
});

// ── Stats vocaux API ─────────────────────────────────────────
app.get('/api/voice-stats', authPanel, (req, res) => {
  const stats = Object.entries(db.voiceStats)
    .sort(([,a],[,b]) => b.totalMinutes - a.totalMinutes)
    .slice(0, 20)
    .map(([id,vs]) => ({ id, ...vs, isActive: !!db.voiceActive[id] }));
  res.json({ stats, active: db.voiceActive });
});

app.get('/api/voice-live', authPanel, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const result = [];
    guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).forEach(vc => {
      const members = vc.members.filter(m => !m.user.bot);
      if (!members.size) return;
      result.push({
        channelId:   vc.id,
        channelName: vc.name,
        members:     members.map(m => ({
          id:       m.id,
          username: m.user.username,
          avatar:   m.user.displayAvatarURL({ dynamic:true }),
          muted:    m.voice.selfMute,
          deafened: m.voice.selfDeaf,
          streaming:m.voice.streaming,
        })),
      });
    });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Tickets API ───────────────────────────────────────────────
app.get('/api/tickets', authPanel, (req, res) => {
  res.json({
    categories: db.ticketCategories,
    active:     db.ticketMap,
    count:      db.ticketCount || 0,
  });
});

app.post('/api/ticket-category', authPanel, (req, res) => {
  const { id, label, desc, color } = req.body;
  if (!id || !label) return res.status(400).json({ error: 'id et label requis' });
  const safeid = id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const existing = db.ticketCategories.findIndex(c => c.id === safeid);
  if (existing >= 0) db.ticketCategories[existing] = { id:safeid, label, desc:desc||'', color:color||'#5865F2' };
  else db.ticketCategories.push({ id:safeid, label, desc:desc||'', color:color||'#5865F2' });
  log(`🎫 Catégorie ticket: ${label}`);
  res.json({ ok:true, categories: db.ticketCategories });
});

app.delete('/api/ticket-category/:id', authPanel, (req, res) => {
  const id = req.params.id;
  db.ticketCategories = db.ticketCategories.filter(c => c.id !== id);
  res.json({ ok:true, categories: db.ticketCategories });
});

// ── Routes de base ────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status:'ok', bot:client.user?.tag||'connecting...', panel:'/admin/nexusbot-panel.html', articles:db.articles.length, customCmds:Object.keys(db.customCmds).length, version:'ULTIMATE' }));

app.post('/sellhub', async (req, res) => {
  res.status(200).json({ ok:true });
  const { event, data } = req.body||{};
  if ((event==='order.created'||event==='order.completed')&&CH_SALES) {
    const guild = client.guilds.cache.get(GUILD_ID);
    const ch = guild?.channels.cache.get(CH_SALES);
    if (ch) { const o=data||{}; ch.send({ embeds:[new EmbedBuilder().setTitle('💰 Nouvelle Vente !').setColor(C('#10d982')).addFields({name:'📦 Produit',value:o.product?.name||'—',inline:true},{name:'💵 Montant',value:o.amount?parseFloat(o.amount).toFixed(2)+'€':'—',inline:true}).setTimestamp().setFooter({text:'Sellhub'})] }); }
    if (data?.discordId&&ROLE_VIP) { const g=client.guilds.cache.get(GUILD_ID); const m=await g?.members.fetch(data.discordId).catch(()=>null); if(m){const r=g.roles.cache.get(ROLE_VIP);if(r)m.roles.add(r).catch(()=>{});addPts(data.discordId,50);} }
  }
});

app.listen(PORT, () => log(`🌐 Serveur démarré sur le port ${PORT} | Panel: /admin/nexusbot-panel.html`));

// ═══════════════════════════════════════════════════════════════════
// ─── HANDLERS COMMANDES MEE6 / DRAFTBOT ─────────────────────────
// ═══════════════════════════════════════════════════════════════════

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;
  const g   = interaction.guild;

  // ══ TEMPBAN ══
  if (cmd === 'tempban') {
    const t   = interaction.options.getMember('membre');
    const min = interaction.options.getInteger('minutes');
    const r   = interaction.options.getString('raison') || 'Aucune raison';
    if (!t?.bannable) return interaction.reply({ embeds:[ERR('Impossible de bannir ce membre.')], ephemeral:true });
    if (!db.warns[t.id]) db.warns[t.id] = [];
    db.warns[t.id].push({ reason:`[TEMPBAN ${min}min] ${r}`, modId:interaction.user.id, date:new Date().toLocaleString('fr-FR') });
    t.send({ embeds:[new EmbedBuilder().setTitle('⏳ Banni temporairement').setDescription(`**Serveur :** ${g.name}\n**Durée :** ${min} minute(s)\n**Raison :** ${r}`).setColor(C('#ff4d4d')).setTimestamp()] }).catch(()=>{});
    await t.ban({ reason:`[TEMPBAN ${min}min] ${r}` });
    setTimeout(async () => {
      try { await g.members.unban(t.id, 'Tempban expiré'); } catch(e) {}
    }, min * 60000);
    if (CH_LOGS) { const l=g.channels.cache.get(CH_LOGS); if(l) l.send({ embeds:[new EmbedBuilder().setTitle('⏳ TempBan').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${t.user.username} (${t.id})`},{name:'Durée',value:`${min}min`},{name:'Raison',value:r},{name:'Modérateur',value:interaction.user.username}).setTimestamp()] }); }
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('⏳ TempBan appliqué').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${t}`,inline:true},{name:'Durée',value:`${min}min`,inline:true},{name:'Raison',value:r}).setTimestamp()] });
  }

  // ══ TEMPMUTE ══
  if (cmd === 'tempmute') {
    const t   = interaction.options.getMember('membre');
    const min = interaction.options.getInteger('minutes');
    const r   = interaction.options.getString('raison') || 'Aucune raison';
    try {
      await t.timeout(min * 60000, r);
      t.send({ embeds:[new EmbedBuilder().setTitle('🔇 Sourdine temporaire').setDescription(`**Durée :** ${min}min\n**Raison :** ${r}`).setColor(C('#f0b429')).setTimestamp()] }).catch(()=>{});
      if (CH_LOGS) { const l=g.channels.cache.get(CH_LOGS); if(l) l.send({ embeds:[new EmbedBuilder().setTitle('🔇 TempMute').setColor(C('#f0b429')).addFields({name:'Membre',value:`<@${t.id}>`},{name:'Durée',value:`${min}min`},{name:'Raison',value:r},{name:'Modérateur',value:interaction.user.username}).setTimestamp()] }); }
      return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🔇 TempMute').setColor(C('#f0b429')).addFields({name:'Membre',value:`${t}`,inline:true},{name:'Durée',value:`${min}min`,inline:true},{name:'Raison',value:r}).setTimestamp()] });
    } catch(e) { return interaction.reply({ embeds:[ERR(e.message)], ephemeral:true }); }
  }

  // ══ INFRACTIONS ══
  if (cmd === 'infractions') {
    const t     = interaction.options.getUser('membre');
    const warns = db.warns[t.id] || [];
    const u     = getUser(t.id);
    const emb   = new EmbedBuilder().setTitle(`📋 Infractions — ${t.username}`).setThumbnail(t.displayAvatarURL({dynamic:true})).setColor(C('#ff4d4d')).setTimestamp();
    emb.addFields(
      { name:'⚠️ Total warns', value:`**${warns.length}**`, inline:true },
      { name:'💰 Points perdus', value:'—', inline:true },
      { name:'💬 Messages', value:`${u.messages||0}`, inline:true },
    );
    if (warns.length) {
      warns.slice(-10).reverse().forEach((w,i) => emb.addFields({ name:`#${warns.length-i} • ${w.date}`, value:`**Raison :** ${w.reason}\n**Modérateur :** <@${w.modId==='AutoMod'?'0':w.modId}>${w.modId==='AutoMod'?' *(Auto-Mod)*':''}` }));
    } else {
      emb.setDescription('✅ Aucune infraction enregistrée.');
    }
    return interaction.reply({ embeds:[emb] });
  }

  // ══ PURGE BOTS ══
  if (cmd === 'purge-bots') {
    const msgs = await interaction.channel.messages.fetch({ limit:100 });
    const botMsgs = [...msgs.values()].filter(m=>m.author.bot).slice(0, interaction.options.getInteger('nombre'));
    if (!botMsgs.length) return interaction.reply({ embeds:[ERR('Aucun message de bot trouvé.')], ephemeral:true });
    await interaction.channel.bulkDelete(botMsgs, true).catch(()=>{});
    return interaction.reply({ embeds:[OK(`${botMsgs.length} message(s) de bot supprimé(s).`, '')], ephemeral:true });
  }

  // ══ PURGE USER ══
  if (cmd === 'purge-user') {
    const target = interaction.options.getMember('membre');
    const nb     = interaction.options.getInteger('nombre') || 50;
    const msgs   = await interaction.channel.messages.fetch({ limit:100 });
    const uMsgs  = [...msgs.values()].filter(m=>m.author.id===target.id).slice(0,nb);
    if (!uMsgs.length) return interaction.reply({ embeds:[ERR('Aucun message de ce membre.')], ephemeral:true });
    await interaction.channel.bulkDelete(uMsgs, true).catch(()=>{});
    return interaction.reply({ embeds:[OK(`${uMsgs.length} message(s) de ${target.user.username} supprimé(s).`, '')], ephemeral:true });
  }

  // ══ USERINFO ══
  if (cmd === 'userinfo') {
    const member = interaction.options.getMember('membre') || interaction.member;
    const user   = member.user;
    const u      = getUser(user.id);
    const vs     = db.voiceStats[user.id] || { totalMinutes:0, sessions:0 };
    const warns  = db.warns[user.id] || [];
    const roles  = member.roles.cache.filter(r=>r.id!==g.id).sort((a,b)=>b.position-a.position);
    const flags  = user.flags?.toArray() || [];
    const badges = flags.map(f => ({ STAFF:'👑',PARTNER:'🤝',HYPESQUAD:'🏠',BUG_HUNTER_LEVEL_1:'🐛',HYPESQUAD_ONLINE_HOUSE_1:'🟡',HYPESQUAD_ONLINE_HOUSE_2:'🔴',HYPESQUAD_ONLINE_HOUSE_3:'🟣',BUG_HUNTER_LEVEL_2:'🐛✨',VERIFIED_BOT_DEVELOPER:'⚙️',ACTIVE_DEVELOPER:'🧑‍💻' }[f]||'')).filter(Boolean);
    const statusMap = { online:'🟢 En ligne', idle:'🟡 Absent', dnd:'🔴 Ne pas déranger', offline:'⚫ Hors ligne' };
    const h = Math.floor(vs.totalMinutes/60), m2 = vs.totalMinutes%60;
    return interaction.reply({ embeds:[new EmbedBuilder()
      .setTitle(`👤 ${user.username}${user.discriminator&&user.discriminator!=='0'?'#'+user.discriminator:''}`)
      .setThumbnail(user.displayAvatarURL({dynamic:true,size:256}))
      .setColor(member.displayHexColor||'#5865F2')
      .addFields(
        { name:'🆔 ID', value:`\`${user.id}\``, inline:true },
        { name:'🤖 Bot', value:user.bot?'Oui':'Non', inline:true },
        { name:'📅 Compte créé', value:`<t:${Math.floor(user.createdTimestamp/1000)}:R>`, inline:true },
        { name:'📥 Rejoint le', value:`<t:${Math.floor(member.joinedTimestamp/1000)}:R>`, inline:true },
        { name:'🏆 Présence', value:statusMap[member.presence?.status||'offline'], inline:true },
        { name:'🎨 Couleur', value:member.displayHexColor||'défaut', inline:true },
        { name:'💰 Points', value:`**${u.points}** (Rang #${rank(user.id)})`, inline:true },
        { name:'⭐ Niveau', value:`**${u.level}** (${u.xp} XP)`, inline:true },
        { name:'⚠️ Warns', value:`**${warns.length}**`, inline:true },
        { name:'🎤 Temps vocal', value:`**${h}h ${m2}min**`, inline:true },
        { name:'💬 Messages', value:`**${u.messages||0}**`, inline:true },
        { name:'⭐ Réputation', value:`**${getRep(user.id).total}**`, inline:true },
        { name:`🎭 Rôles (${roles.size})`, value:roles.size?roles.map(r=>r.toString()).slice(0,10).join(' '):'Aucun', inline:false },
        ...(badges.length ? [{ name:'🏅 Badges', value:badges.join(' '), inline:false }] : []),
      )
      .setFooter({ text:`Pseudo : ${member.displayName}` })
      .setTimestamp()
    ] });
  }

  // ══ SERVERINFO ══
  if (cmd === 'serverinfo') {
    await g.fetch();
    await g.members.fetch();
    const humans  = g.members.cache.filter(m=>!m.user.bot).size;
    const bots    = g.members.cache.filter(m=>m.user.bot).size;
    const online  = g.members.cache.filter(m=>!m.user.bot&&m.presence?.status&&m.presence.status!=='offline').size;
    const textCh  = g.channels.cache.filter(c=>c.type===ChannelType.GuildText).size;
    const voiceCh = g.channels.cache.filter(c=>c.type===ChannelType.GuildVoice).size;
    const catCh   = g.channels.cache.filter(c=>c.type===ChannelType.GuildCategory).size;
    const verif   = ['Aucune','Faible','Moyenne','Élevée','Très élevée'][g.verificationLevel] || '?';
    const boost   = g.premiumSubscriptionCount || 0;
    const boostLv = g.premiumTier;
    return interaction.reply({ embeds:[new EmbedBuilder()
      .setTitle(`🏠 ${g.name}`)
      .setThumbnail(g.iconURL({dynamic:true,size:256}))
      .setImage(g.bannerURL({size:1024})||null)
      .setColor(C('#5865F2'))
      .addFields(
        { name:'🆔 ID', value:`\`${g.id}\``, inline:true },
        { name:'👑 Propriétaire', value:`<@${g.ownerId}>`, inline:true },
        { name:'📅 Créé le', value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`, inline:true },
        { name:'👥 Total membres', value:`**${g.memberCount}** (${humans} humains, ${bots} bots)`, inline:false },
        { name:'🟢 En ligne', value:`**${online}**`, inline:true },
        { name:'🎤 En vocal', value:`**${Object.keys(db.voiceActive).length}**`, inline:true },
        { name:'💬 Texte', value:`**${textCh}**`, inline:true },
        { name:'🔊 Vocal', value:`**${voiceCh}**`, inline:true },
        { name:'📁 Catégories', value:`**${catCh}**`, inline:true },
        { name:'🎭 Rôles', value:`**${g.roles.cache.size}**`, inline:true },
        { name:'😀 Emojis', value:`**${g.emojis.cache.size}**`, inline:true },
        { name:'🚀 Boosts', value:`**${boost}** — Niveau **${boostLv}**`, inline:true },
        { name:'🔒 Vérification', value:verif, inline:true },
        { name:'📝 Description', value:g.description||'Aucune', inline:false },
      )
      .setTimestamp()
      .setFooter({ text:'NexusBot — Données en temps réel' })
    ] });
  }

  // ══ ROLEINFO ══
  if (cmd === 'roleinfo') {
    const role = interaction.options.getRole('role');
    const members = g.members.cache.filter(m=>m.roles.cache.has(role.id));
    const perms = role.permissions.toArray().slice(0,8).map(p=>p.replace(/_/g,' ').toLowerCase());
    return interaction.reply({ embeds:[new EmbedBuilder()
      .setTitle(`🎭 ${role.name}`)
      .setColor(role.color || C('#5865F2'))
      .addFields(
        { name:'🆔 ID', value:`\`${role.id}\``, inline:true },
        { name:'👥 Membres', value:`**${members.size}**`, inline:true },
        { name:'🎨 Couleur', value:role.hexColor||'Défaut', inline:true },
        { name:'📌 Position', value:`${role.position}`, inline:true },
        { name:'🏷️ Mentionnable', value:role.mentionable?'✅':'❌', inline:true },
        { name:'🎨 Affiché séparément', value:role.hoist?'✅':'❌', inline:true },
        { name:'🤖 Géré par bot', value:role.managed?'✅':'❌', inline:true },
        { name:'📅 Créé le', value:`<t:${Math.floor(role.createdTimestamp/1000)}:D>`, inline:true },
        { name:'🔑 Permissions', value:perms.length?perms.join(', '):'Aucune', inline:false },
      )
      .setTimestamp()
    ] });
  }

  // ══ CHANNELINFO ══
  if (cmd === 'channelinfo') {
    const ch = interaction.options.getChannel('salon') || interaction.channel;
    const typeMap = { 0:'💬 Texte', 2:'🔊 Vocal', 4:'📁 Catégorie', 5:'📢 Annonces', 13:'🎙️ Stage', 15:'📋 Forum' };
    return interaction.reply({ embeds:[new EmbedBuilder()
      .setTitle(`# ${ch.name}`)
      .setColor(C('#5865F2'))
      .addFields(
        { name:'🆔 ID', value:`\`${ch.id}\``, inline:true },
        { name:'📌 Type', value:typeMap[ch.type]||`${ch.type}`, inline:true },
        { name:'📁 Catégorie', value:ch.parent?.name||'Aucune', inline:true },
        { name:'🗣️ Topic', value:ch.topic||'Aucun', inline:false },
        { name:'🐌 Slow mode', value:ch.rateLimitPerUser?`${ch.rateLimitPerUser}s`:'Désactivé', inline:true },
        { name:'🔒 NSFW', value:ch.nsfw?'✅':'❌', inline:true },
        { name:'📅 Créé le', value:`<t:${Math.floor(ch.createdTimestamp/1000)}:D>`, inline:true },
        ...(ch.type===2?[{ name:'👥 Membres', value:`${ch.members?.size||0}`, inline:true },{ name:'🔈 Limite', value:ch.userLimit?`${ch.userLimit}`:'∞', inline:true }]:[]),
      )
      .setTimestamp()
    ] });
  }

  // ══ BOTINFO ══
  if (cmd === 'botinfo') {
    const uptime = client.uptime || 0;
    const d = Math.floor(uptime/86400000), h = Math.floor((uptime%86400000)/3600000), m2 = Math.floor((uptime%3600000)/60000);
    const mem = process.memoryUsage().heapUsed / 1024 / 1024;
    return interaction.reply({ embeds:[new EmbedBuilder()
      .setTitle(`🤖 ${client.user.username}`)
      .setThumbnail(client.user.displayAvatarURL({dynamic:true,size:256}))
      .setColor(C('#5865F2'))
      .addFields(
        { name:'🏷️ Tag', value:client.user.tag, inline:true },
        { name:'🆔 ID', value:`\`${client.user.id}\``, inline:true },
        { name:'⏱️ Uptime', value:`${d}j ${h}h ${m2}m`, inline:true },
        { name:'💓 Ping API', value:`${Math.round(client.ws.ping)}ms`, inline:true },
        { name:'💾 RAM', value:`${mem.toFixed(1)} MB`, inline:true },
        { name:'📡 Serveurs', value:`${client.guilds.cache.size}`, inline:true },
        { name:'📦 Articles', value:`${db.articles.length}`, inline:true },
        { name:'⚡ Cmds custom', value:`${Object.keys(db.customCmds).length}`, inline:true },
        { name:'💰 Membres éco', value:`${Object.keys(db.economy).length}`, inline:true },
        { name:'🔧 Discord.js', value:'v14', inline:true },
        { name:'📗 Node.js', value:process.version, inline:true },
        { name:'🚀 Hébergé sur', value:'Railway', inline:true },
      )
      .setTimestamp()
      .setFooter({ text:'NexusBot ULTIMATE — 100% gratuit' })
    ] });
  }

  // ══ XP RESET ══
  if (cmd === 'xp-reset') {
    const t = interaction.options.getUser('membre');
    db.economy[t.id] = { points:0, xp:0, level:1, lastDaily:0, lastMsg:0, totalEarned:0, messages:0 };
    return interaction.reply({ embeds:[OK('XP réinitialisé', `Le profil de <@${t.id}> a été remis à zéro.`)] });
  }

  // ══ XP SET ══
  if (cmd === 'xp-set') {
    const t  = interaction.options.getUser('membre');
    const nv = interaction.options.getInteger('niveau');
    const u  = getUser(t.id);
    u.level = nv; u.xp = 0;
    return interaction.reply({ embeds:[OK('Niveau défini', `<@${t.id}> est maintenant **niveau ${nv}**.`)] });
  }

  // ══ XP ADD ══
  if (cmd === 'xp-add') {
    const t   = interaction.options.getUser('membre');
    const xpA = interaction.options.getInteger('xp');
    const u   = getUser(t.id);
    const levelUp = addXP(t.id, xpA);
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('➕ XP ajouté').setDescription(`+**${xpA} XP** à <@${t.id}>\nNiveau actuel : **${u.level}**${levelUp?' ⬆️ Level up !':''}`).setColor(C('#10d982')).setTimestamp()] });
  }

  // ══ NIVEAUX ══
  if (cmd === 'niveaux') {
    if (!db.levelRoles.length) return interaction.reply({ embeds:[INF('Rôles de niveaux', 'Aucun rôle configuré. Utilisez `/role-niveau`.')] });
    const sorted = [...db.levelRoles].sort((a,b)=>a.level-b.level);
    const emb = new EmbedBuilder().setTitle('⭐ Rôles par niveau').setColor(C('#f0b429')).setTimestamp();
    sorted.forEach(lr => {
      const role = g.roles.cache.get(lr.roleId);
      emb.addFields({ name:`Niveau ${lr.level}`, value:role?role.toString():`ID: ${lr.roleId}`, inline:true });
    });
    return interaction.reply({ embeds:[emb] });
  }

  // ══ AUTOROLE ══
  if (cmd === 'autorole') {
    const action = interaction.options.getString('action');
    const role   = interaction.options.getRole('role');
    if (action === 'add') {
      if (!role) return interaction.reply({ embeds:[ERR('Rôle requis.')], ephemeral:true });
      if (!db.autoRoles.includes(role.id)) db.autoRoles.push(role.id);
      return interaction.reply({ embeds:[OK('Auto-rôle ajouté', `**@${role.name}** sera donné aux nouveaux membres.`)] });
    }
    if (action === 'remove') {
      if (!role) return interaction.reply({ embeds:[ERR('Rôle requis.')], ephemeral:true });
      db.autoRoles = db.autoRoles.filter(r=>r!==role.id);
      return interaction.reply({ embeds:[OK('Auto-rôle retiré', `**@${role.name}** n'est plus automatique.`)] });
    }
    if (action === 'list') {
      if (!db.autoRoles.length) return interaction.reply({ embeds:[INF('Auto-rôles', 'Aucun auto-rôle configuré.')] });
      const list = db.autoRoles.map(id=>{const r=g.roles.cache.get(id);return r?r.toString():`ID:${id}`;});
      return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🎭 Auto-rôles').setDescription(list.join('\n')).setColor(C('#5865F2')).setTimestamp()] });
    }
  }

  // ══ TRANSFERER ══
  if (cmd === 'transferer') {
    const t  = interaction.options.getUser('membre');
    const nb = interaction.options.getInteger('montant');
    if (t.id === interaction.user.id) return interaction.reply({ embeds:[ERR('Tu ne peux pas te transférer des points.')], ephemeral:true });
    const u = getUser(interaction.user.id);
    if (u.points < nb) return interaction.reply({ embeds:[ERR(`Tu n'as que **${u.points} points**.`)], ephemeral:true });
    u.points -= nb;
    addPts(t.id, nb);
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('💸 Transfert effectué !').setColor(C('#10d982')).addFields({name:'📤 Envoyé',value:`<@${interaction.user.id}>`,inline:true},{name:'📥 Reçu par',value:`<@${t.id}>`,inline:true},{name:'💰 Montant',value:`**${nb} points**`,inline:true}).setTimestamp()] });
  }

  // ══ TRAVAILLER ══
  if (cmd === 'travailler') {
    const u  = getUser(interaction.user.id);
    const cd = 3600000; // 1h
    if (Date.now() - (u.lastWork||0) < cd) {
      const left = Math.ceil((cd-(Date.now()-(u.lastWork||0)))/60000);
      return interaction.reply({ embeds:[ERR(`Tu as déjà travaillé. Reviens dans **${left} min**.`)], ephemeral:true });
    }
    const JOBS = [
      { job:'Livreur 🚴', min:30, max:80 }, { job:'Développeur 💻', min:80, max:200 },
      { job:'Chef cuisinier 👨‍🍳', min:50, max:120 }, { job:'Médecin 👨‍⚕️', min:100, max:250 },
      { job:'Streamer 🎮', min:20, max:300 }, { job:'Vendeur 🛒', min:40, max:100 },
      { job:'Musicien 🎵', min:30, max:150 }, { job:'Designer 🎨', min:60, max:180 },
    ];
    const j    = JOBS[Math.floor(Math.random()*JOBS.length)];
    const gain = Math.floor(Math.random()*(j.max-j.min+1))+j.min;
    u.lastWork = Date.now();
    addPts(interaction.user.id, gain);
    addXP(interaction.user.id, Math.floor(gain/5));
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('💼 Travail effectué !').setDescription(`Tu as travaillé comme **${j.job}** et gagné **${gain} points** !`).setColor(C('#10d982')).addFields({name:'💰 Solde',value:`${u.points} pts`,inline:true}).setTimestamp()] });
  }

  // ══ CRIME ══
  if (cmd === 'crime') {
    const u   = getUser(interaction.user.id);
    const cd  = 7200000; // 2h
    if (Date.now() - (u.lastCrime||0) < cd) {
      const left = Math.ceil((cd-(Date.now()-(u.lastCrime||0)))/60000);
      return interaction.reply({ embeds:[ERR(`Trop risqué. Attends **${left} min**.`)], ephemeral:true });
    }
    u.lastCrime = Date.now();
    const success = Math.random() > 0.4; // 60% succès
    const CRIMES = ['Pickpocket 🤏','Braquage de banque 🏦','Trafic de carte bleue 💳','Vol de voiture 🚗','Arnaque en ligne 💻','Vol à l\'étalage 🛍️'];
    const crime  = CRIMES[Math.floor(Math.random()*CRIMES.length)];
    if (success) {
      const gain = Math.floor(Math.random()*500)+100;
      addPts(interaction.user.id, gain);
      return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🔫 Crime réussi !').setDescription(`Tu as réussi un **${crime}** et volé **${gain} points** !`).setColor(C('#10d982')).setTimestamp()] });
    } else {
      const fine = Math.min(u.points, Math.floor(Math.random()*200)+50);
      u.points -= fine;
      if (!db.warns[interaction.user.id]) db.warns[interaction.user.id]=[];
      db.warns[interaction.user.id].push({ reason:`[AUTO] Crime — ${crime}`, modId:'AutoMod', date:new Date().toLocaleString('fr-FR') });
      return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🚔 Arrêté !').setDescription(`Tu as été pris lors d'un **${crime}** !\nAmende : **-${fine} points** + 1 warn.`).setColor(C('#ff4d4d')).setTimestamp()] });
    }
  }

  // ══ PARI ══
  if (cmd === 'pari') {
    const u  = getUser(interaction.user.id);
    const nb = interaction.options.getInteger('montant');
    if (u.points < nb) return interaction.reply({ embeds:[ERR(`Tu n'as que **${u.points} points**.`)], ephemeral:true });
    const win = Math.random() > 0.5;
    if (win) { addPts(interaction.user.id, nb); return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🎰 Tu as gagné !').setDescription(`+**${nb} points** ! Total : **${u.points} pts**`).setColor(C('#10d982')).setTimestamp()] }); }
    else { u.points -= nb; return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🎰 Tu as perdu !').setDescription(`-**${nb} points**. Solde : **${u.points} pts**`).setColor(C('#ff4d4d')).setTimestamp()] }); }
  }

  // ══ INVENTAIRE ══
  if (cmd === 'inventaire') {
    const u     = getUser(interaction.user.id);
    const roles = db.roleShop.filter(r=>interaction.member.roles.cache.has(r.roleId));
    const emb   = new EmbedBuilder().setTitle(`🎒 Inventaire — ${interaction.user.username}`).setColor(C('#9d6fff')).setTimestamp();
    emb.addFields(
      { name:'💰 Points', value:`**${u.points}**`, inline:true },
      { name:'⭐ Niveau', value:`**${u.level}**`, inline:true },
      { name:'⭐ Réputation', value:`**${getRep(interaction.user.id).total}**`, inline:true },
    );
    if (roles.length) emb.addFields({ name:'🛍️ Rôles achetés', value:roles.map(r=>{const role=g.roles.cache.get(r.roleId);return role?role.toString():`ID:${r.roleId}`;}).join(' '), inline:false });
    else emb.addFields({ name:'🛍️ Rôles achetés', value:'Aucun — voir `/shop-roles`', inline:false });
    return interaction.reply({ embeds:[emb] });
  }

  // ══ RESET ECO ══
  if (cmd === 'reset-eco') {
    const t = interaction.options.getUser('membre');
    db.economy[t.id] = { points:0, xp:0, level:1, lastDaily:0, lastMsg:0, totalEarned:0, messages:0 };
    return interaction.reply({ embeds:[OK('Économie réinitialisée', `Profil économie de <@${t.id}> remis à zéro.`)] });
  }

  // ══ MUSIQUE (info) ══
  if (cmd === 'musique') {
    return interaction.reply({ embeds:[new EmbedBuilder()
      .setTitle('🎵 Musique — NexusBot')
      .setDescription('La musique Discord nécessite un hébergement spécifique.\nPour avoir la musique, voici les alternatives :')
      .setColor(C('#9d6fff'))
      .addFields(
        { name:'🤖 Bots recommandés', value:'• **Hydra** — hydra.bot\n• **Muse** — open source\n• **Jockie** — jockie.bot', inline:false },
        { name:'📦 Si tu veux l\'intégrer', value:'Ajoute `@discordjs/voice` + `ytdl-core` dans `package.json`', inline:false },
      )
      .setTimestamp()
    ] });
  }

  // ══ EMBED ══
  if (cmd === 'embed') {
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const emb    = new EmbedBuilder()
      .setTitle(interaction.options.getString('titre'))
      .setDescription(interaction.options.getString('description'))
      .setColor(C(interaction.options.getString('couleur')||'#5865F2'))
      .setTimestamp()
      .setFooter({ text:`Par ${interaction.user.username}` });
    if (interaction.options.getString('image'))     emb.setImage(interaction.options.getString('image'));
    if (interaction.options.getString('thumbnail')) emb.setThumbnail(interaction.options.getString('thumbnail'));
    if (interaction.options.getString('footer'))    emb.setFooter({ text:interaction.options.getString('footer') });
    await target.send({ content:interaction.options.getString('mention')||undefined, embeds:[emb] });
    return interaction.reply({ embeds:[OK('Embed envoyé !', `Dans ${target}.`)], ephemeral:true });
  }

  // ══ SAY ══
  if (cmd === 'say') {
    const target = interaction.options.getChannel('channel') || interaction.channel;
    await target.send({ content:interaction.options.getString('message') });
    return interaction.reply({ embeds:[OK('Message envoyé !', `Dans ${target}.`)], ephemeral:true });
  }

  // ══ CALCUL ══
  if (cmd === 'calcul') {
    const expr = interaction.options.getString('expression');
    try {
      const safe = expr.replace(/[^0-9+\-*/().% ]/g, '');
      if (!safe.trim()) throw new Error('Expression invalide');
      // eslint-disable-next-line no-new-func
      const result = new Function(`return (${safe})`)();
      if (!isFinite(result)) throw new Error('Résultat infini');
      return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🔢 Calculatrice').addFields({name:'Expression',value:`\`${expr}\``,inline:true},{name:'Résultat',value:`**${result}**`,inline:true}).setColor(C('#10d982')).setTimestamp()] });
    } catch(e) {
      return interaction.reply({ embeds:[ERR(`Expression invalide : \`${expr}\``)], ephemeral:true });
    }
  }

  // ══ TIMER ══
  if (cmd === 'timer') {
    const minutes = interaction.options.getInteger('minutes');
    const titre   = interaction.options.getString('titre') || 'Compte à rebours';
    const target  = interaction.options.getChannel('channel') || interaction.channel;
    const end     = Date.now() + minutes * 60000;
    await target.send({ embeds:[new EmbedBuilder().setTitle(`⏱️ ${titre}`).setDescription(`Fin dans **${minutes} minute(s)**\n\n⏰ Se termine <t:${Math.floor(end/1000)}:R>`).setColor(C('#f0b429')).setTimestamp(new Date(end))] });
    setTimeout(() => {
      target.send({ embeds:[new EmbedBuilder().setTitle(`⏰ Fin : ${titre}`).setDescription('Le timer est terminé !').setColor(C('#10d982')).setTimestamp()] });
    }, minutes * 60000);
    return interaction.reply({ embeds:[OK(`Timer de ${minutes}min lancé !`, `Dans ${target}.`)], ephemeral:true });
  }

  // ══ VOTE ══
  if (cmd === 'vote') {
    const question = interaction.options.getString('question');
    const target   = interaction.options.getChannel('channel') || interaction.channel;
    const msg = await target.send({ embeds:[new EmbedBuilder().setTitle(`🗳️ Vote : ${question}`).setColor(C('#4d8fff')).setFooter({text:`Par ${interaction.user.username}`}).setTimestamp()] });
    await msg.react('👍');
    await msg.react('👎');
    await msg.react('🤷');
    return interaction.reply({ embeds:[OK('Vote créé !', `Dans ${target}.`)], ephemeral:true });
  }

  // ══ CONVERT ══
  if (cmd === 'convert') {
    const montant = interaction.options.getNumber('montant');
    const de      = interaction.options.getString('de').toUpperCase();
    const vers    = interaction.options.getString('vers').toUpperCase();
    const RATES   = { EUR:1, USD:1.08, GBP:0.86, JPY:162, CHF:0.97, CAD:1.47, AUD:1.66, CNY:7.85, BRL:5.4, MXN:18.5, INR:89.5, KRW:1450, MAD:10.8, DZD:145, TND:3.35, XOF:655, CAF:655 };
    if (!RATES[de] || !RATES[vers]) return interaction.reply({ embeds:[ERR(`Devise non supportée. Disponibles : ${Object.keys(RATES).join(', ')}`)], ephemeral:true });
    const result = (montant / RATES[de]) * RATES[vers];
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('💱 Conversion').addFields({name:'Montant',value:`**${montant} ${de}**`,inline:true},{name:'Résultat',value:`**${result.toFixed(2)} ${vers}**`,inline:true}).setColor(C('#10d982')).setFooter({text:'Taux approximatifs'}).setTimestamp()] });
  }

  // ══ COLOR ══
  if (cmd === 'color') {
    let hex = interaction.options.getString('hex').replace('#','');
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return interaction.reply({ embeds:[ERR('Code hex invalide. Ex: `#5865F2`')], ephemeral:true });
    const r = parseInt(hex.substring(0,2),16), gv = parseInt(hex.substring(2,4),16), b = parseInt(hex.substring(4,6),16);
    const hsl = (() => {
      const r2=r/255,g2=gv/255,b2=b/255;
      const max=Math.max(r2,g2,b2),min=Math.min(r2,g2,b2),l=(max+min)/2;
      if(max===min)return`0°, 0%, ${Math.round(l*100)}%`;
      const s=l>0.5?(max-min)/(2-max-min):(max-min)/(max+min);
      let h2=0;
      if(max===r2)h2=((g2-b2)/(max-min)+6)%6;
      else if(max===g2)h2=(b2-r2)/(max-min)+2;
      else h2=(r2-g2)/(max-min)+4;
      return`${Math.round(h2*60)}°, ${Math.round(s*100)}%, ${Math.round(l*100)}%`;
    })();
    return interaction.reply({ embeds:[new EmbedBuilder()
      .setTitle(`🎨 Couleur #${hex.toUpperCase()}`)
      .setColor(parseInt(hex,16))
      .addFields(
        { name:'🔴 HEX', value:`\`#${hex.toUpperCase()}\``, inline:true },
        { name:'🟢 RGB', value:`\`rgb(${r}, ${gv}, ${b})\``, inline:true },
        { name:'🔵 HSL', value:`\`hsl(${hsl})\``, inline:true },
        { name:'🔢 Decimal', value:`\`${parseInt(hex,16)}\``, inline:true },
      )
      .setTimestamp()
    ] });
  }

  // ══ TICKET RENAME ══
  if (cmd === 'ticket-rename') {
    if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ embeds:[ERR('Cette commande est réservée aux tickets.')], ephemeral:true });
    const newName = interaction.options.getString('nom').toLowerCase().replace(/[^a-z0-9-]/g,'-');
    await interaction.channel.setName(`ticket-${newName}`);
    return interaction.reply({ embeds:[OK('Ticket renommé !', `Nouveau nom : **ticket-${newName}**`)] });
  }

  // ══ TICKET INFO ══
  if (cmd === 'ticket-info') {
    if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ embeds:[ERR('Pas dans un ticket.')], ephemeral:true });
    const uid  = Object.entries(db.ticketMap).find(([,cid])=>cid===interaction.channel.id)?.[0];
    const msgs = await interaction.channel.messages.fetch({ limit:100 });
    const cat  = interaction.channel.topic?.split(' • ')[0] || 'Inconnue';
    return interaction.reply({ embeds:[new EmbedBuilder()
      .setTitle(`🎫 ${interaction.channel.name}`)
      .setColor(C('#5865F2'))
      .addFields(
        { name:'👤 Créateur', value:uid?`<@${uid}>`:'Inconnu', inline:true },
        { name:'📋 Catégorie', value:cat, inline:true },
        { name:'💬 Messages', value:`${msgs.size}`, inline:true },
        { name:'📅 Créé', value:`<t:${Math.floor(interaction.channel.createdTimestamp/1000)}:R>`, inline:true },
      )
      .setTimestamp()
    ], ephemeral:true });
  }

  // ══ MES TICKETS ══
  if (cmd === 'mes-tickets') {
    const myTicketId = db.ticketMap[interaction.user.id];
    const emb = new EmbedBuilder().setTitle(`🎫 Mes tickets — ${interaction.user.username}`).setColor(C('#5865F2')).setTimestamp();
    if (myTicketId) {
      emb.addFields({ name:'🔓 Ticket ouvert', value:`<#${myTicketId}>`, inline:false });
    } else {
      emb.setDescription('Aucun ticket ouvert. Utilisez `/ticket` pour en créer un.');
    }
    return interaction.reply({ embeds:[emb], ephemeral:true });
  }
});

client.login(TOKEN).catch(e => { console.error('❌', e.message); process.exit(1); });

