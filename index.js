// ═══════════════════════════════════════════════════════════════════
//  NexusBot ULTIMATE — MEE6 + Draftbot complet + Panel Live
//  ✅ Stats serveur visuelles (vocaux, membres, bots...)
//  ✅ Tickets multi-catégories avec panel
//  ✅ Auto-modération complète
//  ✅ Niveaux XP + rôles automatiques
//  ✅ Économie + boutique de rôles
//  ✅ Giveaway, sondages, reaction roles
//  ✅ Anniversaires, rappels, sticky
//  ✅ Fun complet (blague, 8ball, dé, météo...)
//  ✅ Réputation, classements
//  ✅ Logs complets (edit, delete, vocal, join, leave)
//  ✅ Panel admin mobile 100% connecté en live
//  ✅ Commandes custom live via panel
// ═══════════════════════════════════════════════════════════════════

const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, ChannelType, REST, Routes,
  SlashCommandBuilder, Events, ActivityType
} = require('discord.js');
const express = require('express');
const path = require('path');

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

// ─── BASE DE DONNÉES ────────────────────────────────────────
const db = {
  articles: [],
  shopConfig: {
    name: 'NexusStore', description: '', banner: '', color: '#f0b429',
    footer: 'Paiement 100% sécurisé 🔒',
    features: ['✅ **Livraison instantanée**','🔒 **100% Sécurisé**','🛠️ **Produits vérifiés**','💸 **Remboursement assuré**']
  },
  boutiqueConfig: {
    lien: STORE_URL, nom: process.env.STORE_NAME||'NexusStore',
    emailContact: process.env.EMAIL_CONTACT||'',
    emailPaiement: process.env.EMAIL_PAIEMENT||'',
    stripeLien: process.env.STRIPE_LIEN||'',
    sumupLien: process.env.SUMUP_LIEN||'',
  },
  sellhubProducts: [],
  economy: {},
  levelRoles: [],
  warns: {},
  modConfig: {
    antispam: true, antilink: false, anticaps: false,
    autosanction: true, dm: true, logs: true,
    spamThreshold: 5, spamWindow: 5000, bannedWords: [],
  },
  spamTracker: {},
  // Tickets multi-catégories
  ticketMap: {},       // { userId: channelId }
  ticketCategories: [  // Catégories configurables
    { id: 'commande',  label: '📦 Commande',  desc: 'Problème avec un achat',     color: '#5865F2' },
    { id: 'support',   label: '🔧 Support',   desc: 'Aide technique',              color: '#f0b429' },
    { id: 'question',  label: '❓ Question',  desc: 'Renseignements',              color: '#10d982' },
    { id: 'litige',    label: '⚖️ Litige',    desc: 'Contestation ou réclamation', color: '#ff4d4d' },
    { id: 'partenariat',label:'🤝 Partenariat','desc':'Demande de partenariat',    color: '#9d6fff' },
  ],
  ticketCount: 0,
  giveaways: {},
  polls: {},
  reactionRoles: {},
  customCmds: {},
  rep: {},
  birthdays: {},
  reminders: [],
  sticky: {},
  autoRoles: [],
  applications: [],
  roleShop: [],
  voiceStats: {},
  voiceActive: {},
  welcomeConfig: {
    enabled: !!CH_WELCOME, channelId: CH_WELCOME,
    message: '👋 Bienvenue **{user}** sur **{server}** !\nNous sommes maintenant **{count}** membres 🎉\n\n📜 `/regles` | 🛒 `/shop` | 🎫 `/ticket`',
    color: '#5865F2', showAvatar: true,
  },
  autoRoleConfig: { enabled: false, roleId: ROLE_MEMBER },
  panelLogs: [],
  statsChannels: {}, // { guildId: { members: chId, online: chId, bots: chId } }
};

// ─── HELPERS ────────────────────────────────────────────────
const C   = h => parseInt((h||'#5865F2').replace('#',''), 16);
const log = m => {
  const e = { time: new Date().toLocaleTimeString('fr-FR'), msg: m };
  console.log(`[${e.time}] ${m}`);
  db.panelLogs.unshift(e);
  if (db.panelLogs.length > 300) db.panelLogs.pop();
};

function getUser(id) {
  if (!db.economy[id]) db.economy[id] = { points:0, xp:0, level:1, lastDaily:0, lastMsg:0, totalEarned:0, messages:0 };
  return db.economy[id];
}
function addXP(id, n) {
  const u = getUser(id); u.xp += n; u.messages++;
  const need = u.level * 100;
  if (u.xp >= need) { u.xp -= need; u.level++; return true; }
  return false;
}
function addPts(id, n) { const u=getUser(id); u.points+=n; u.totalEarned+=n; return u.points; }
function rank(id) { return Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).findIndex(([i])=>i===id)+1; }
function getRep(id) { if (!db.rep[id]) db.rep[id]={total:0,lastGiven:0}; return db.rep[id]; }

const OK  = (t,d) => new EmbedBuilder().setTitle(`✅ ${t}`).setDescription(d||'\u200b').setColor(C('#10d982')).setTimestamp();
const ERR = d     => new EmbedBuilder().setTitle('❌ Erreur').setDescription(d).setColor(C('#ff4d4d')).setTimestamp();
const INF = (t,d) => new EmbedBuilder().setTitle(`ℹ️ ${t}`).setDescription(d||'\u200b').setColor(C('#4d8fff')).setTimestamp();

function articleEmbed(a) {
  const emb = new EmbedBuilder()
    .setTitle(`${a.emoji||'🛒'} ${a.name}`)
    .setColor(C(a.color||'#f0b429'))
    .setTimestamp()
    .setFooter({ text:`${db.shopConfig.name} • Paiement sécurisé 🔒` });
  if (a.description) emb.setDescription(a.description);
  const fields = [{ name:'💰 Prix', value:`**${a.price}**`, inline:true }];
  if (a.stock !== undefined) fields.push({ name:'📦 Stock', value:a.stock===0?'❌ Rupture':a.stock===-1?'♾️ Illimité':`✅ ${a.stock}`, inline:true });
  if (a.link) fields.push({ name:'🔗 Acheter', value:`[**→ Payer**](${a.link})`, inline:false });
  emb.addFields(fields);
  if (a.image) emb.setImage(a.image);
  return emb;
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
    emb.addFields({ name:`${a.emoji||'🛒'} ${a.name}`, value:`${stock} — **${a.price}**${a.link?`\n[→ Acheter](${a.link})`:''}`, inline:true });
  });
  if (STORE_URL) emb.addFields({ name:'\u200b', value:`[🌐 Voir la boutique](${STORE_URL})`, inline:false });
  return emb;
}

// ─── AUTO-MOD ────────────────────────────────────────────────
async function autoMod(msg) {
  if (!msg.guild) return;
  const cfg = db.modConfig;
  if (!cfg.antispam && !cfg.antilink && !cfg.anticaps && !cfg.bannedWords?.length) return;
  const member = msg.member;
  if (member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  let violated = null;

  if (cfg.antispam) {
    if (!db.spamTracker[msg.author.id]) db.spamTracker[msg.author.id] = { count:0, lastMsg:0 };
    const t = db.spamTracker[msg.author.id];
    if (Date.now()-t.lastMsg < (cfg.spamWindow||5000)) {
      t.count++;
      if (t.count >= (cfg.spamThreshold||5)) { violated = '🚨 Spam détecté'; t.count = 0; }
    } else { t.count = 1; }
    t.lastMsg = Date.now();
  }

  if (!violated && cfg.antilink && /https?:\/\/|discord\.gg\//i.test(msg.content)) {
    const ok = [ROLE_SUPPORT,ROLE_VIP,ROLE_MEMBER].filter(Boolean).some(r=>member?.roles.cache.has(r));
    if (!ok) violated = '🔗 Lien non autorisé';
  }

  if (!violated && cfg.anticaps && msg.content.length > 10) {
    const letters = msg.content.replace(/[^A-Za-z]/g,'');
    if (letters.length > 5 && letters.replace(/[^A-Z]/g,'').length/letters.length > 0.7) violated = '🔠 Trop de majuscules';
  }

  if (!violated && cfg.bannedWords?.length) {
    const lower = msg.content.toLowerCase();
    const found = cfg.bannedWords.find(w=>lower.includes(w.toLowerCase()));
    if (found) violated = `🚫 Mot interdit`;
  }

  if (!violated) return;

  msg.delete().catch(()=>{});
  if (!db.warns[msg.author.id]) db.warns[msg.author.id] = [];
  db.warns[msg.author.id].push({ reason:`[AUTO-MOD] ${violated}`, modId:'AutoMod', date:new Date().toLocaleString('fr-FR') });
  const total = db.warns[msg.author.id].length;

  if (cfg.dm) msg.author.send({ embeds:[new EmbedBuilder().setTitle('⚠️ Avertissement automatique').setDescription(`**Raison :** ${violated}\n**Serveur :** ${msg.guild.name}\n**Total warns :** ${total}`).setColor(C('#f0b429')).setTimestamp()] }).catch(()=>{});

  const warn = await msg.channel.send({ embeds:[new EmbedBuilder().setDescription(`⚠️ ${msg.author} — ${violated}`).setColor(C('#f0b429'))] });
  setTimeout(()=>warn.delete().catch(()=>{}), 5000);

  if (cfg.autosanction && total >= 3) {
    member?.timeout(10*60000,'Auto-mod: 3 warns').catch(()=>{});
    msg.channel.send({ embeds:[new EmbedBuilder().setDescription(`🔇 ${msg.author} mis en sourdine automatiquement (3 warns).`).setColor(C('#ff4d4d'))] });
  }

  if (CH_LOGS) {
    const ch = msg.guild.channels.cache.get(CH_LOGS);
    if (ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🤖 Auto-Mod').setColor(C('#f0b429')).addFields(
      {name:'Membre',value:`${msg.author} (${msg.author.id})`},
      {name:'Infraction',value:violated},
      {name:'Contenu',value:msg.content.substring(0,200)||'[vide]'},
      {name:'Total warns',value:`${total}`}
    ).setTimestamp()] });
  }
}

// ─── TICKETS MULTI-CATÉGORIES ────────────────────────────────
async function sendTicketPanel(channel) {
  const cats = db.ticketCategories;
  const options = cats.map(c => ({ label:c.label, description:c.desc, value:c.id }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category')
    .setPlaceholder('📋 Choisissez une catégorie...')
    .addOptions(options);
  const row = new ActionRowBuilder().addComponents(menu);
  const emb = new EmbedBuilder()
    .setTitle('🎫 Centre de Support')
    .setColor(C('#5865F2'))
    .setDescription('Sélectionnez la catégorie correspondant à votre demande :\n\n' +
      cats.map(c=>`${c.label} — *${c.desc}*`).join('\n'))
    .setFooter({ text:'Notre équipe vous répondra rapidement' })
    .setTimestamp();
  await channel.send({ embeds:[emb], components:[row] });
}

async function openTicket(guild, user, categoryId='support') {
  if (db.ticketMap[user.id]) {
    const ex = guild.channels.cache.get(db.ticketMap[user.id]);
    if (ex) return { already:true, channel:ex };
  }
  db.ticketCount++;
  const cat = db.ticketCategories.find(c=>c.id===categoryId)||db.ticketCategories[1];
  const num  = String(db.ticketCount).padStart(4,'0');
  const name = `ticket-${num}-${user.username.toLowerCase().replace(/[^a-z0-9]/g,'').substring(0,12)}`;
  const perms = [
    { id:guild.id, deny:[PermissionFlagsBits.ViewChannel] },
    { id:user.id, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles] },
  ];
  if (ROLE_SUPPORT) perms.push({ id:ROLE_SUPPORT, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageMessages] });
  const opts = { name, type:ChannelType.GuildText, topic:`${cat.label} • ${user.tag} (${user.id}) • Ticket #${num}`, permissionOverwrites:perms };
  if (CH_TICKETS) { const cat2=guild.channels.cache.get(CH_TICKETS); if(cat2?.type===ChannelType.GuildCategory) opts.parent=CH_TICKETS; }
  const channel = await guild.channels.create(opts);
  db.ticketMap[user.id] = channel.id;

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('t_close').setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('t_claim').setLabel('✋ Prendre en charge').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('t_transcript').setLabel('📄 Transcript').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('t_add_user').setLabel('➕ Ajouter').setStyle(ButtonStyle.Primary),
  );

  await channel.send({
    content:`${user}${ROLE_SUPPORT?` <@&${ROLE_SUPPORT}>`:''} — Ticket #${num}`,
    embeds:[new EmbedBuilder()
      .setTitle(`${cat.label} — Ticket #${num}`)
      .setDescription(`Bienvenue ${user} ! 👋\n\nVeuillez décrire votre demande en détail.\nNotez les informations importantes (commande, captures...).`)
      .setColor(C(cat.color||'#5865F2'))
      .addFields(
        {name:'📋 Catégorie',value:cat.label,inline:true},
        {name:'👤 Utilisateur',value:`${user.tag}`,inline:true},
        {name:'⏱️ Temps de réponse',value:'< 24h',inline:true},
        {name:'🔢 Ticket',value:`#${num}`,inline:true},
      )
      .setThumbnail(user.displayAvatarURL({dynamic:true}))
      .setTimestamp()
    ],
    components:[closeRow]
  });

  addPts(user.id, 5);
  if (CH_LOGS) {
    const l = guild.channels.cache.get(CH_LOGS);
    if (l) l.send({ embeds:[new EmbedBuilder().setTitle('🎫 Nouveau Ticket').setColor(C('#f0b429')).addFields(
      {name:'Utilisateur',value:`${user.tag} (${user.id})`},
      {name:'Catégorie',value:cat.label},
      {name:'Salon',value:`<#${channel.id}>`},
      {name:'Ticket',value:`#${num}`}
    ).setTimestamp()] });
  }
  return { channel, num };
}

async function closeTicket(channel, closer) {
  const uid = Object.entries(db.ticketMap).find(([,cid])=>cid===channel.id)?.[0];
  if (uid) delete db.ticketMap[uid];

  // Générer le transcript
  const msgs = await channel.messages.fetch({ limit:100 });
  const txt = [...msgs.values()].reverse()
    .map(m=>`[${new Date(m.createdTimestamp).toLocaleString('fr-FR')}] ${m.author.username}: ${m.content||'[embed/fichier]'}`)
    .join('\n');

  await channel.send({ embeds:[new EmbedBuilder().setTitle('🔒 Ticket Fermé').setDescription(`Fermé par ${closer}.\nSuppression dans 10 secondes.\n\nTranscript joint ci-dessous.`).setColor(C('#ff4d4d')).setTimestamp()] });

  if (CH_LOGS) {
    const l = channel.guild.channels.cache.get(CH_LOGS);
    if (l) l.send({
      embeds:[new EmbedBuilder().setTitle('🔒 Ticket Fermé').setColor(C('#ff4d4d')).addFields(
        {name:'Salon',value:channel.name},
        {name:'Fermé par',value:`${closer.tag||closer}`},
      ).setTimestamp()],
      files:[{ attachment:Buffer.from(txt,'utf-8'), name:`transcript-${channel.name}.txt` }]
    });
  }
  setTimeout(()=>channel.delete().catch(()=>{}), 10000);
}

// ─── GIVEAWAY ────────────────────────────────────────────────
async function endGiveaway(msgId, guild) {
  const gw = db.giveaways[msgId];
  if (!gw||gw.ended) return;
  gw.ended = true;
  const ch = guild.channels.cache.get(gw.channel);
  const entries = [...gw.entries];
  if (!ch) return;
  if (!entries.length) return ch.send({ embeds:[ERR(`Giveaway **${gw.prize}** — aucun participant.`)] });

  // Multi-gagnants
  const nbWinners = gw.winners||1;
  const winners = [];
  const pool = [...entries];
  for (let i=0; i<Math.min(nbWinners,pool.length); i++) {
    const idx = Math.floor(Math.random()*pool.length);
    winners.push(pool.splice(idx,1)[0]);
  }
  gw.winnersList = winners;
  winners.forEach(w=>addPts(w, 100));

  ch.send({
    content:winners.map(w=>`🎉 <@${w}>`).join(' '),
    embeds:[new EmbedBuilder()
      .setTitle('🎉 Giveaway Terminé !')
      .setColor(C('#10d982'))
      .addFields(
        {name:'🏆 Prix',value:gw.prize,inline:true},
        {name:`🎊 Gagnant${winners.length>1?'s':''}`,value:winners.map(w=>`<@${w}>`).join('\n'),inline:true},
        {name:'👥 Participants',value:`${entries.length}`,inline:true},
      )
      .setTimestamp()
    ]
  });
}

// ─── CODE CUSTOM ─────────────────────────────────────────────
async function runCustomCode(code, interaction) {
  try {
    const fn = new Function(
      'interaction','guild','user','db','EmbedBuilder','ActionRowBuilder',
      'ButtonBuilder','ButtonStyle','addPts','addXP','getUser','C',
      `return (async()=>{ ${code} })()`
    );
    await fn(interaction,interaction.guild,interaction.user,db,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,addPts,addXP,getUser,C);
    return { ok:true };
  } catch(e) { log(`❌ Code custom: ${e.message}`); return { ok:false, error:e.message }; }
}

// ─── SLASH COMMANDS ─────────────────────────────────────────
const COMMANDS = [
  // Général
  new SlashCommandBuilder().setName('ping').setDescription('🏓 Latence du bot'),
  new SlashCommandBuilder().setName('aide').setDescription('📋 Liste des commandes'),
  new SlashCommandBuilder().setName('info').setDescription('ℹ️ Informations du serveur'),
  new SlashCommandBuilder().setName('stats-serveur').setDescription('📊 Stats visuelles complètes du serveur'),
  new SlashCommandBuilder().setName('profil').setDescription('👤 Profil d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Avatar d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('banniere').setDescription('🎨 Bannière d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('rapport').setDescription('📑 Rapport complet admin').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Boutique
  new SlashCommandBuilder().setName('shop').setDescription('🛒 Afficher la boutique'),
  new SlashCommandBuilder().setName('article').setDescription('🛒 Détails d\'un article').addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)),
  new SlashCommandBuilder().setName('ajouter-article').setDescription('➕ Ajouter un article').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true))
    .addStringOption(o=>o.setName('prix').setDescription('Prix').setRequired(true))
    .addStringOption(o=>o.setName('lien').setDescription('Lien de paiement').setRequired(true))
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
    .addStringOption(o=>o.setName('userid').setDescription('ID').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('🔇 Sourdine').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Durée').setMinValue(1).setMaxValue(40320))
    .addStringOption(o=>o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('unmute').setDescription('🔊 Enlever sourdine').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('🗑️ Supprimer messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName('nombre').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('lock').setDescription('🔒 Verrouiller salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('🔓 Déverrouiller salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('slowmode').setDescription('🐌 Slow mode').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(o=>o.setName('secondes').setDescription('Secondes (0=off)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  new SlashCommandBuilder().setName('automod').setDescription('⚙️ Config auto-modération').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption(o=>o.setName('antispam').setDescription('Anti-spam'))
    .addBooleanOption(o=>o.setName('antilink').setDescription('Anti-lien'))
    .addBooleanOption(o=>o.setName('anticaps').setDescription('Anti-majuscules')),
  new SlashCommandBuilder().setName('mot-interdit').setDescription('🚫 Gérer mots bannis').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('action').setDescription('add/remove/list').setRequired(true).addChoices({name:'Ajouter',value:'add'},{name:'Retirer',value:'remove'},{name:'Liste',value:'list'}))
    .addStringOption(o=>o.setName('mot').setDescription('Le mot')),

  // Tickets
  new SlashCommandBuilder().setName('ticket').setDescription('🎫 Ouvrir un ticket'),
  new SlashCommandBuilder().setName('setup-tickets').setDescription('🎫 Installer le panel tickets').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Salon où installer le panel').setRequired(true)),
  new SlashCommandBuilder().setName('fermer').setDescription('🔒 Fermer le ticket actuel'),
  new SlashCommandBuilder().setName('add').setDescription('➕ Ajouter un membre au ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('retirer').setDescription('➖ Retirer un membre du ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('ajouter-categorie').setDescription('➕ Ajouter une catégorie de ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('id').setDescription('Identifiant unique (ex: vip)').setRequired(true))
    .addStringOption(o=>o.setName('label').setDescription('Nom affiché (ex: 👑 VIP)').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Description').setRequired(true))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex')),

  // Économie & Niveaux
  new SlashCommandBuilder().setName('points').setDescription('💰 Voir ses points').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('niveau').setDescription('⭐ Voir son niveau').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('daily').setDescription('🎁 Points quotidiens'),
  new SlashCommandBuilder().setName('classement').setDescription('🏆 Top 10 points'),
  new SlashCommandBuilder().setName('classement-xp').setDescription('⭐ Top 10 niveaux'),
  new SlashCommandBuilder().setName('donner-points').setDescription('💸 Donner des points').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('retirer-points').setDescription('💸 Retirer des points').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('shop-roles').setDescription('🛍️ Boutique de rôles'),
  new SlashCommandBuilder().setName('acheter-role').setDescription('🛍️ Acheter un rôle')
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('ajouter-role-shop').setDescription('🛍️ Mettre un rôle en vente').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true))
    .addIntegerOption(o=>o.setName('prix').setDescription('Prix').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('role-niveau').setDescription('🎭 Configurer rôle automatique par niveau').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(o=>o.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1))
    .addRoleOption(o=>o.setName('role').setDescription('Rôle à attribuer').setRequired(true)),

  // Réputation
  new SlashCommandBuilder().setName('rep').setDescription('⭐ Donner de la réputation').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('ma-rep').setDescription('⭐ Voir la réputation').addUserOption(o=>o.setName('membre').setDescription('Membre')),

  // Giveaway
  new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Créer un giveaway').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('prix').setDescription('Prix').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1))
    .addIntegerOption(o=>o.setName('gagnants').setDescription('Nombre de gagnants').setMinValue(1).setMaxValue(10))
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

  // Messages & Annonces
  new SlashCommandBuilder().setName('annonce').setDescription('📢 Envoyer une annonce embed').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o=>o.setName('message').setDescription('Contenu').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone/@here'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex'))
    .addStringOption(o=>o.setName('image').setDescription('URL image')),
  new SlashCommandBuilder().setName('message-perso').setDescription('💬 Envoyer un message').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('contenu').setDescription('Contenu').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('boutons').setDescription('🔘 Embed avec boutons liens').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o=>o.setName('btn1').setDescription('Bouton 1: texte|lien').setRequired(true))
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
    .addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({name:'🛒 Vente',value:'vente'},{name:'🎮 Gaming',value:'gaming'},{name:'💬 Communauté',value:'communaute'}))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel cible')),
  new SlashCommandBuilder().setName('setup-salon').setDescription('⚙️ Créer un salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices(
      {name:'🛒 Boutique',value:'shop'},{name:'📜 Règles',value:'rules'},
      {name:'👋 Bienvenue',value:'welcome'},{name:'🎫 Tickets',value:'tickets'},
      {name:'📢 Annonces',value:'annonces'},{name:'💬 Général',value:'general'},
      {name:'🏆 Classement',value:'classement'},{name:'📊 Stats vocaux',value:'vocaux'}
    )),
  new SlashCommandBuilder().setName('setup-serveur').setDescription('🚀 Config complète du serveur').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({name:'🛒 Vente',value:'vente'},{name:'🎮 Gaming',value:'gaming'},{name:'💬 Communauté',value:'communaute'})),
  new SlashCommandBuilder().setName('config-shop').setDescription('⚙️ Config boutique').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex'))
    .addStringOption(o=>o.setName('footer').setDescription('Footer')),
  new SlashCommandBuilder().setName('config-bienvenue').setDescription('⚙️ Config message bienvenue').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('message').setDescription('Message ({user},{server},{count})'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex')),
  new SlashCommandBuilder().setName('regles').setDescription('📜 Afficher les règles'),

  // Fun
  new SlashCommandBuilder().setName('blague').setDescription('😂 Blague aléatoire'),
  new SlashCommandBuilder().setName('pile-ou-face').setDescription('🪙 Pile ou face'),
  new SlashCommandBuilder().setName('des').setDescription('🎲 Lancer un dé').addIntegerOption(o=>o.setName('faces').setDescription('Nombre de faces').setMinValue(2).setMaxValue(100)),
  new SlashCommandBuilder().setName('choisir').setDescription('🎯 Choisir parmi des options').addStringOption(o=>o.setName('options').setDescription('Options séparées par |').setRequired(true)),
  new SlashCommandBuilder().setName('citation').setDescription('💬 Citation inspirante'),
  new SlashCommandBuilder().setName('8ball').setDescription('🎱 Boule magique').addStringOption(o=>o.setName('question').setDescription('Ta question').setRequired(true)),
  new SlashCommandBuilder().setName('compteur').setDescription('🔢 Compter les membres par statut'),

  // Rappels & Anniversaires
  new SlashCommandBuilder().setName('rappel').setDescription('⏰ Créer un rappel')
    .addIntegerOption(o=>o.setName('minutes').setDescription('Dans combien de minutes').setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption(o=>o.setName('message').setDescription('Message').setRequired(true)),
  new SlashCommandBuilder().setName('anniversaire').setDescription('🎂 Définir son anniversaire')
    .addStringOption(o=>o.setName('date').setDescription('Date (JJ/MM)').setRequired(true)),
  new SlashCommandBuilder().setName('prochains-anniversaires').setDescription('🎂 Prochains anniversaires'),

  // Stats vocaux
  new SlashCommandBuilder().setName('stats-vocaux').setDescription('🎤 Stats vocaux d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('classement-vocal').setDescription('🎤 Classement temps vocal'),
  new SlashCommandBuilder().setName('vocal-live').setDescription('🔴 Voir qui est en vocal'),

  // Commandes custom
  new SlashCommandBuilder().setName('cmd').setDescription('▶️ Utiliser une commande personnalisée')
    .addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)),
  new SlashCommandBuilder().setName('cmd-liste').setDescription('📋 Liste des commandes personnalisées'),

  // Candidatures
  new SlashCommandBuilder().setName('postuler').setDescription('📝 Postuler dans l\'équipe'),
  new SlashCommandBuilder().setName('candidatures').setDescription('📋 Voir les candidatures').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(c => c.toJSON());

// ─── CLIENT ─────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildModeration,
  ],
  partials:[Partials.Message,Partials.Channel,Partials.GuildMember,Partials.Reaction],
});

async function register() {
  const rest = new REST({ version:'10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID), { body:COMMANDS });
    log(`✅ ${COMMANDS.length} commandes enregistrées`);
  } catch(e) { log(`❌ Register: ${e.message}`); }
}

// ─── READY ──────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  log(`✅ ${client.user.tag} connecté`);
  client.user.setActivity('🛒 /shop | /aide | Panel Admin', { type:ActivityType.Watching });
  await register();
  if (SH_KEY) {
    try {
      const r = await fetch('https://dash.sellhub.cx/api/sellhub/products', { headers:{ Authorization:SH_KEY } });
      const d = await r.json();
      db.sellhubProducts = d.data||d.products||(Array.isArray(d)?d:[]);
      log(`🛒 ${db.sellhubProducts.length} produits Sellhub`);
    } catch(e) { log(`⚠️ Sellhub: ${e.message}`); }
  }
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
    for (const r of db.reminders.filter(r=>r.time<=now)) {
      try {
        const ch = client.channels.cache.get(r.channelId);
        if (ch) ch.send({ content:`⏰ <@${r.userId}> — **Rappel :** ${r.msg}` });
      } catch(e) {}
    }
    db.reminders = db.reminders.filter(r=>r.time>now);
  }, 30000);
  // Anniversaires (check toutes les heures)
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
        ch.send({ embeds:[new EmbedBuilder().setTitle('🎂 Joyeux Anniversaire !').setDescription(`C'est l'anniversaire de <@${userId}> aujourd'hui ! 🥳🎉\n\n+100 points ajoutés !`).setColor(C('#f0b429')).setTimestamp()] });
        addPts(userId, 100);
      }
    }
  }, 60000);
});

// ─── EVENTS ─────────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async member => {
  addPts(member.id, 10);
  if (ROLE_MEMBER) { const r=member.guild.roles.cache.get(ROLE_MEMBER); if(r) member.roles.add(r).catch(()=>{}); }
  db.autoRoles.forEach(roleId => { const r=member.guild.roles.cache.get(roleId); if(r) member.roles.add(r).catch(()=>{}); });
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
  if (CH_LOGS) { const l=member.guild.channels.cache.get(CH_LOGS); if(l) l.send({ embeds:[new EmbedBuilder().setTitle('📥 Membre rejoint').setColor(C('#10d982')).setThumbnail(member.user.displayAvatarURL({dynamic:true})).addFields({name:'Membre',value:`${member.user.tag} (${member.id})`},{name:'Compte créé',value:`<t:${Math.floor(member.user.createdTimestamp/1000)}:R>`},{name:'Total',value:`${member.guild.memberCount}`}).setTimestamp()] }); }
});

client.on(Events.GuildMemberRemove, async member => {
  if (CH_BYE) { const ch=member.guild.channels.cache.get(CH_BYE); if(ch) ch.send({ embeds:[new EmbedBuilder().setDescription(`👋 **${member.user.username}** a quitté.\nIl reste **${member.guild.memberCount}** membres.`).setColor(C('#ff4d4d')).setTimestamp()] }); }
  if (CH_LOGS) { const l=member.guild.channels.cache.get(CH_LOGS); if(l) l.send({ embeds:[new EmbedBuilder().setTitle('📤 Membre parti').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${member.user.tag} (${member.id})`},{name:'Était là depuis',value:`<t:${Math.floor((member.joinedTimestamp||Date.now())/1000)}:R>`}).setTimestamp()] }); }
});

client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot || !msg.guild) return;
  const member = msg.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageMessages)) await autoMod(msg);
  const u = getUser(msg.author.id);
  if (Date.now()-u.lastMsg > 60000) {
    u.lastMsg = Date.now();
    const levelUp = addXP(msg.author.id, Math.floor(Math.random()*5)+1);
    addPts(msg.author.id, 1);
    if (levelUp) {
      msg.channel.send({ embeds:[new EmbedBuilder().setTitle('⭐ Level Up !').setDescription(`Félicitations ${msg.author} ! Tu es maintenant **niveau ${u.level}** ! 🎉`).setColor(C('#f0b429')).setThumbnail(msg.author.displayAvatarURL({dynamic:true})).setTimestamp()] }).catch(()=>{});
      addPts(msg.author.id, u.level*10);
      const reward = db.levelRoles.find(lr=>lr.level===u.level);
      if (reward) { const role=msg.guild.roles.cache.get(reward.roleId); if(role) member?.roles.add(role).catch(()=>{}); }
    }
  }
  // Sticky
  if (db.sticky[msg.channel.id]) {
    const st = db.sticky[msg.channel.id];
    try { const old=await msg.channel.messages.fetch(st.msgId).catch(()=>null); if(old) old.delete().catch(()=>{}); } catch(e) {}
    const newMsg = await msg.channel.send({ embeds:[new EmbedBuilder().setDescription(`📌 **Message épinglé**\n\n${st.content}`).setColor(C('#5865F2'))] });
    st.msgId = newMsg.id;
  }
});

client.on(Events.MessageUpdate, async (old, newMsg) => {
  if (!old.guild || old.author?.bot || old.content===newMsg.content) return;
  if (!CH_LOGS) return;
  const ch = old.guild.channels.cache.get(CH_LOGS);
  if (ch) ch.send({ embeds:[new EmbedBuilder().setTitle('✏️ Message modifié').setColor(C('#4d8fff')).addFields({name:'Membre',value:`${old.author} (${old.author?.id})`},{name:'Salon',value:`<#${old.channel.id}>`},{name:'Avant',value:old.content?.substring(0,400)||'[inconnu]'},{name:'Après',value:newMsg.content?.substring(0,400)||'[inconnu]'},{name:'Lien',value:`[Voir](${newMsg.url})`}).setTimestamp()] });
});

client.on(Events.MessageDelete, async msg => {
  if (!msg.guild || msg.author?.bot) return;
  if (!CH_LOGS) return;
  const ch = msg.guild.channels.cache.get(CH_LOGS);
  if (ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🗑️ Message supprimé').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${msg.author||'Inconnu'} (${msg.author?.id||'?'})`},{name:'Salon',value:`<#${msg.channel.id}>`},{name:'Contenu',value:msg.content?.substring(0,400)||'[embed/fichier]'}).setTimestamp()] });
});

// Stats vocaux
client.on(Events.VoiceStateUpdate, async (old, newState) => {
  const userId = newState.member?.id||old.member?.id;
  if (!userId || newState.member?.user.bot) return;
  if (!db.voiceStats[userId]) db.voiceStats[userId] = { totalMinutes:0, sessions:0, lastJoin:0 };
  const vs = db.voiceStats[userId];

  if (!old.channel && newState.channel) {
    // Rejoint
    db.voiceActive[userId] = newState.channel.id;
    vs.lastJoin = Date.now(); vs.sessions++;
    if (CH_LOGS) { const ch=newState.guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🔊 Rejoint vocal').setColor(C('#10d982')).addFields({name:'Membre',value:`${newState.member}`},{name:'Salon',value:newState.channel.name}).setTimestamp()] }); }
  } else if (old.channel && !newState.channel) {
    // Quitté
    delete db.voiceActive[userId];
    if (vs.lastJoin) { const min=Math.floor((Date.now()-vs.lastJoin)/60000); vs.totalMinutes+=min; addPts(userId,Math.floor(min/5)); }
    if (CH_LOGS) { const ch=old.guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🔇 Quitté vocal').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${old.member}`},{name:'Salon',value:old.channel.name}).setTimestamp()] }); }
  } else if (old.channel && newState.channel && old.channel.id!==newState.channel.id) {
    // Changement
    db.voiceActive[userId] = newState.channel.id;
    if (CH_LOGS) { const ch=newState.guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🔀 Changement vocal').setColor(C('#4d8fff')).addFields({name:'Membre',value:`${newState.member}`},{name:'Avant',value:old.channel.name},{name:'Après',value:newState.channel.name}).setTimestamp()] }); }
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
    if (roleId) { const m=await reaction.message.guild?.members.fetch(user.id).catch(()=>null); const r=reaction.message.guild?.roles.cache.get(roleId); if(m&&r) m.roles.add(r).catch(()=>{}); }
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
    if (roleId) { const m=await reaction.message.guild?.members.fetch(user.id).catch(()=>null); const r=reaction.message.guild?.roles.cache.get(roleId); if(m&&r) m.roles.remove(r).catch(()=>{}); }
  }
});

// ─── INTERACTIONS ────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {

  // ══ SELECT MENU ══ (tickets)
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
    if (id==='t_close') {
      if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ content:'❌', ephemeral:true });
      await interaction.reply({ content:'🔒 Fermeture dans 10 secondes...' });
      return closeTicket(interaction.channel, interaction.user);
    }
    if (id==='t_claim') {
      await interaction.reply({ content:`✋ **${interaction.user.username}** prend en charge ce ticket.` });
      if (ROLE_SUPPORT) interaction.channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel:true, SendMessages:true, ManageMessages:true }).catch(()=>{});
      return;
    }
    if (id==='t_transcript') {
      await interaction.deferReply({ ephemeral:true });
      const msgs = await interaction.channel.messages.fetch({ limit:100 });
      const txt = [...msgs.values()].reverse().map(m=>`[${new Date(m.createdTimestamp).toLocaleString('fr-FR')}] ${m.author.username}: ${m.content||'[embed]'}`).join('\n');
      return interaction.editReply({ files:[{ attachment:Buffer.from(txt,'utf-8'), name:`transcript-${interaction.channel.name}.txt` }] });
    }
    if (id==='t_add_user') {
      const modal = new ModalBuilder().setCustomId('add_user_modal').setTitle('➕ Ajouter un membre');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID Discord du membre').setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }
    if (id==='gw_join') {
      const gw = db.giveaways[interaction.message.id];
      if (!gw||gw.ended) return interaction.reply({ content:'❌ Giveaway terminé.', ephemeral:true });
      if (gw.entries.has(interaction.user.id)) { gw.entries.delete(interaction.user.id); return interaction.reply({ content:`😔 Retiré. Participants : **${gw.entries.size}**`, ephemeral:true }); }
      gw.entries.add(interaction.user.id);
      return interaction.reply({ content:`🎉 Tu participes ! Participants : **${gw.entries.size}**`, ephemeral:true });
    }
    if (id.startsWith('app_ok_')||id.startsWith('app_no_')) {
      const idx=parseInt(id.split('_')[2]), app=db.applications[idx];
      if (!app) return interaction.reply({ content:'❌', ephemeral:true });
      const ok = id.startsWith('app_ok_');
      app.status = ok?'acceptée':'refusée';
      const u = await client.users.fetch(app.userId).catch(()=>null);
      if (u) u.send({ embeds:[new EmbedBuilder().setTitle(ok?'✅ Candidature Acceptée !':'❌ Candidature Refusée').setDescription(ok?`Bienvenue dans l'équipe de **${interaction.guild.name}** !`:`Ta candidature n'a pas été retenue.`).setColor(C(ok?'#10d982':'#ff4d4d')).setTimestamp()] }).catch(()=>{});
      await interaction.update({ components:[] });
      return interaction.followUp({ content:`${ok?'✅':'❌'} : **${app.username}**`, ephemeral:true });
    }
    return;
  }

  // ══ MODALS ══
  if (interaction.isModalSubmit()) {
    if (interaction.customId==='app_modal') {
      const answers=['app_q1','app_q2','app_q3'].map(q=>interaction.fields.getTextInputValue(q));
      const app={ userId:interaction.user.id, username:interaction.user.username, answers, date:new Date().toLocaleString('fr-FR'), status:'en attente' };
      db.applications.push(app);
      const idx=db.applications.length-1;
      await interaction.reply({ embeds:[OK('Candidature envoyée !','Ta candidature a bien été reçue.')], ephemeral:true });
      if (CH_LOGS) {
        const ch=interaction.guild.channels.cache.get(CH_LOGS);
        if (ch) ch.send({
          embeds:[new EmbedBuilder().setTitle('📝 Nouvelle Candidature').setColor(C('#f0b429')).setThumbnail(interaction.user.displayAvatarURL({dynamic:true})).addFields({name:'Candidat',value:`${interaction.user}`},{name:'Motivation',value:answers[0]},{name:'Expérience',value:answers[1]},{name:'Dispo',value:answers[2]}).setTimestamp()],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`app_ok_${idx}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`app_no_${idx}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger))]
        });
      }
      return;
    }
    if (interaction.customId==='add_user_modal') {
      const userId = interaction.fields.getTextInputValue('user_id').trim();
      try {
        const member = await interaction.guild.members.fetch(userId);
        await interaction.channel.permissionOverwrites.edit(userId, { ViewChannel:true, SendMessages:true, ReadMessageHistory:true });
        await interaction.reply({ embeds:[OK('Membre ajouté',`${member} a maintenant accès à ce ticket.`)] });
      } catch(e) { await interaction.reply({ embeds:[ERR(`Membre introuvable : ${e.message}`)], ephemeral:true }); }
      return;
    }
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  // ══ COMMANDES CUSTOM PANEL ══
  if (cmd==='cmd') {
    const nom=interaction.options.getString('nom').toLowerCase().replace(/\s+/g,'-');
    const c=db.customCmds[nom];
    if (!c) return interaction.reply({ embeds:[ERR(`Commande \`${nom}\` introuvable.`)], ephemeral:true });
    if (c.code&&c.code.trim()) {
      await interaction.deferReply({ ephemeral:c.ephemeral||false });
      const result=await runCustomCode(c.code,interaction);
      if (!result.ok) return interaction.editReply({ embeds:[ERR(`Erreur : \`${result.error}\``)] });
      return;
    }
    if (!c.reponse) return interaction.reply({ embeds:[ERR('Commande sans réponse.')], ephemeral:true });
    const text=c.reponse.replace('{user}',interaction.user.toString()).replace('{server}',interaction.guild.name).replace('{count}',interaction.guild.memberCount.toString()).replace('{points}',getUser(interaction.user.id).points.toString());
    if (c.type==='embed') return interaction.reply({ embeds:[new EmbedBuilder().setDescription(text).setColor(C(c.color||'#f0b429')).setTimestamp()] });
    return interaction.reply({ content:text });
  }

  if (cmd==='cmd-liste') {
    const cmds=Object.entries(db.customCmds);
    if (!cmds.length) return interaction.reply({ embeds:[INF('Commandes perso','Aucune. Créez-en depuis le panel admin.')], ephemeral:true });
    const emb=new EmbedBuilder().setTitle(`⚡ Commandes personnalisées (${cmds.length})`).setColor(C('#f0b429')).setTimestamp();
    cmds.forEach(([n,c])=>emb.addFields({name:`/cmd ${n}`,value:c.desc||c.reponse?.substring(0,60)||'Code custom',inline:false}));
    return interaction.reply({ embeds:[emb] });
  }

  // ══ GÉNÉRAL ══
  if (cmd==='ping') {
    const l=Date.now()-interaction.createdTimestamp;
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('🏓 Pong !').setColor(C('#10d982')).addFields({name:'⚡ Latence',value:`\`${l}ms\``,inline:true},{name:'💓 API',value:`\`${Math.round(client.ws.ping)}ms\``,inline:true},{name:'⏱️ Uptime',value:`\`${Math.floor(client.uptime/3600000)}h ${Math.floor((client.uptime%3600000)/60000)}m\``,inline:true}).setTimestamp()] });
  }

  if (cmd==='aide') {
    const customList=Object.keys(db.customCmds).map(n=>`\`/cmd ${n}\``).join(' ')||'Aucune';
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle('📋 NexusBot Ultimate — Toutes les commandes').setColor(C('#f0b429')).addFields(
      {name:'📊 Stats',value:'`/stats-serveur` `/profil` `/avatar` `/banniere` `/rapport` `/compteur`'},
      {name:'🛒 Boutique',value:'`/shop` `/article` `/liste-articles` `/publier-shop` `/paiements` `/contact`'},
      {name:'🛡️ Modération',value:'`/warn` `/warns` `/clearwarns` `/kick` `/ban` `/unban` `/mute` `/unmute` `/clear` `/lock` `/unlock` `/slowmode` `/automod` `/mot-interdit`'},
      {name:'🎫 Tickets',value:'`/ticket` `/setup-tickets` `/fermer` `/add` `/retirer` `/ajouter-categorie`'},
      {name:'💰 Économie',value:'`/points` `/niveau` `/daily` `/classement` `/classement-xp` `/donner-points` `/retirer-points` `/shop-roles` `/acheter-role` `/role-niveau`'},
      {name:'⭐ Réputation',value:'`/rep` `/ma-rep`'},
      {name:'🎉 Events',value:'`/giveaway` `/giveaway-fin` `/giveaway-reroll` `/sondage` `/resultats`'},
      {name:'🎤 Vocaux',value:'`/stats-vocaux` `/classement-vocal` `/vocal-live`'},
      {name:'🎭 Rôles',value:'`/reaction-role` `/donner-role` `/retirer-role` `/ajouter-role-shop`'},
      {name:'📢 Messages',value:'`/annonce` `/message-perso` `/boutons` `/sticky` `/epingler`'},
      {name:'😂 Fun',value:'`/blague` `/pile-ou-face` `/des` `/choisir` `/citation` `/8ball` `/compteur`'},
      {name:'🎂 Perso',value:'`/anniversaire` `/prochains-anniversaires` `/rappel`'},
      {name:'⚡ Custom',value:customList},
    ).setFooter({text:'NexusBot Ultimate • 100% gratuit • Panel Admin Live'}).setTimestamp()] });
  }

  if (cmd==='info') {
    const g=interaction.guild; await g.fetch();
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle(`🏠 ${g.name}`).setThumbnail(g.iconURL({dynamic:true})).setColor(C('#5865F2')).addFields(
      {name:'👥 Membres',value:`${g.memberCount}`,inline:true},
      {name:'📅 Créé le',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
      {name:'🎭 Rôles',value:`${g.roles.cache.size}`,inline:true},
      {name:'# Channels',value:`${g.channels.cache.size}`,inline:true},
      {name:'🚀 Boosts',value:`${g.premiumSubscriptionCount||0} (Niv.${g.premiumTier})`,inline:true},
      {name:'⚡ Cmds custom',value:`${Object.keys(db.customCmds).length}`,inline:true},
    ).setTimestamp()] });
  }

  // ══ STATS SERVEUR VISUEL ══
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
    const catCh   = g.channels.cache.filter(c=>c.type===ChannelType.GuildCategory).size;
    const totalWarns = Object.values(db.warns).reduce((s,w)=>s+w.length, 0);
    const topEco = Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,3).map(([id,d],i)=>`${['🥇','🥈','🥉'][i]} <@${id}> **${d.points}pts** Niv.${d.level}`).join('\n')||'Aucun';
    const topVoice = Object.entries(db.voiceStats).sort(([,a],[,b])=>b.totalMinutes-a.totalMinutes).slice(0,3).map(([id,vs],i)=>{const h=Math.floor(vs.totalMinutes/60),m=vs.totalMinutes%60;return`${['🥇','🥈','🥉'][i]} <@${id}> **${h}h${m}m**`;}).join('\n')||'Aucun';

    // Barre de progression
    const bar = (v,max,len=14) => {
      if (max===0) return '░'.repeat(len)+' 0%';
      const f=Math.max(0,Math.min(len,Math.round((v/max)*len)));
      return '█'.repeat(f)+'░'.repeat(len-f)+` ${Math.round((v/max)*100)}%`;
    };

    // Vocaux actuels
    const voiceChannels = g.channels.cache.filter(c=>c.type===ChannelType.GuildVoice);
    const voiceLines = [];
    voiceChannels.forEach(vc=>{
      const mbs=vc.members.filter(m=>!m.user.bot);
      if(!mbs.size)return;
      voiceLines.push(`🔊 **${vc.name}** (${mbs.size}) — ${mbs.map(m=>m.user.username).join(', ')}`);
    });

    const emb = new EmbedBuilder()
      .setTitle(`📊 Statistiques — ${g.name}`)
      .setThumbnail(g.iconURL({dynamic:true,size:256}))
      .setColor(C('#5865F2'))
      .addFields(
        // Membres
        {name:'━━━━━━━ 👥 MEMBRES ━━━━━━━',value:'\u200b',inline:false},
        {name:'👥 Total',value:`**${total}**`,inline:true},
        {name:'👤 Humains',value:`**${humans}**`,inline:true},
        {name:'🤖 Bots',value:`**${bots}**`,inline:true},
        // Statuts
        {name:'━━━━━━ 🟢 STATUTS ━━━━━━━',value:'\u200b',inline:false},
        {name:'🟢 En ligne',value:`**${online}** ${bar(online,humans,10)}`,inline:false},
        {name:'🟡 Absent',value:`**${idle}** ${bar(idle,humans,10)}`,inline:false},
        {name:'🔴 Ne pas déranger',value:`**${dnd}** ${bar(dnd,humans,10)}`,inline:false},
        {name:'⚫ Hors ligne',value:`**${offline}** ${bar(offline,humans,10)}`,inline:false},
        // Vocal
        {name:'━━━━━━ 🎤 VOCAUX ━━━━━━━',value:'\u200b',inline:false},
        {name:`🎤 En vocal maintenant (${inVoice})`,value:voiceLines.length?voiceLines.join('\n'):'*Personne en vocal actuellement*',inline:false},
        // Serveur
        {name:'━━━━━━ 🏠 SERVEUR ━━━━━━━',value:'\u200b',inline:false},
        {name:'💬 Salons texte',value:`**${textCh}**`,inline:true},
        {name:'🔊 Salons vocaux',value:`**${voiceCh}**`,inline:true},
        {name:'📁 Catégories',value:`**${catCh}**`,inline:true},
        {name:'🎭 Rôles',value:`**${g.roles.cache.size}**`,inline:true},
        {name:'😀 Emojis',value:`**${g.emojis.cache.size}**`,inline:true},
        {name:'🚀 Boosts',value:`**${g.premiumSubscriptionCount||0}** (Niv.${g.premiumTier})`,inline:true},
        // Bot
        {name:'━━━━━━ 🤖 BOT ━━━━━━━',value:'\u200b',inline:false},
        {name:'📦 Articles boutique',value:`**${db.articles.length}**`,inline:true},
        {name:'🎫 Tickets ouverts',value:`**${Object.keys(db.ticketMap).length}**`,inline:true},
        {name:'⚠️ Warns total',value:`**${totalWarns}**`,inline:true},
        {name:'⚡ Cmds custom',value:`**${Object.keys(db.customCmds).length}**`,inline:true},
        {name:'🎉 Giveaways actifs',value:`**${Object.values(db.giveaways).filter(gw=>!gw.ended).length}**`,inline:true},
        {name:'💰 Joueurs éco',value:`**${Object.keys(db.economy).length}**`,inline:true},
        // Top
        {name:'━━━━━ 🏆 TOPS ━━━━━━━',value:'\u200b',inline:false},
        {name:'🏆 Top Points',value:topEco,inline:true},
        {name:'🎤 Top Vocal',value:topVoice,inline:true},
      )
      .setTimestamp()
      .setFooter({text:`${g.name} • Données en temps réel`});

    return interaction.editReply({ embeds:[emb] });
  }

  // ══ PROFIL ══
  if (cmd==='profil') {
    const t=interaction.options.getMember('membre')||interaction.member;
    const u=getUser(t.id), r=getRep(t.id);
    const needed=u.level*100, pct=Math.floor((u.xp/needed)*100);
    const bar='█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10));
    const vm=db.voiceStats[t.id]?.totalMinutes||0;
    const h=Math.floor(vm/60), m=vm%60;
    return interaction.reply({ embeds:[new EmbedBuilder().setTitle(`👤 ${t.user.username}`).setThumbnail(t.user.displayAvatarURL({dynamic:true})).setColor(C('#5865F2')).addFields(
      {name:'💰 Points',value:`**${u.points}** pts (Rang #${rank(t.id)})`,inline:true},
      {name:'⭐ Niveau',value:`**${u.level}** (${u.xp}/${needed} XP)`,inline:true},
      {name:'⭐ Réputation',value:`**${r.total}** ⭐`,inline:true},
      {name:'💬 Messages',value:`${u.messages||0}`,inline:true},
      {name:'🎤 Temps vocal',value:`${h}h ${m}min`,inline:true},
      {name:'⚠️ Warns',value:`${(db.warns[t.id]||[]).length}`,inline:true},
      {name:'📊 Barre XP',value:`[${bar}] ${pct}%`,inline:false},
      {name:'🎭 Rôles',value:t.roles.cache.filter(r=>r.id!==interaction.guild.id).map(r=>r.toString()).slice(0,5).join(' ')||'Aucun',inline:false},
    ).setFooter({text:`Membre depuis ${t.joinedAt?.toLocaleDateString('fr-FR')||'?'}`}).setTimestamp()] });
  }

  if (cmd==='avatar') { const u=interaction.options.getUser('membre')||interaction.user; return interaction.reply({ embeds:[new EmbedBuilder().setTitle(`🖼️ ${u.username}`).setImage(u.displayAvatarURL({dynamic:true,size:1024})).setColor(C('#5865F2')).addFields({name:'🔗 Liens',value:`[PNG](${u.displayAvatarURL({format:'png',size:1024})}) | [WebP](${u.displayAvatarURL({format:'webp',size:1024})})`})] }); }

  if (cmd==='banniere') { const u=interaction.options.getUser('membre')||interaction.user; await u.fetch(); const b=u.bannerURL({dynamic:true,size:1024}); if(!b) return interaction.reply({embeds:[ERR('Pas de bannière.')],ephemeral:true}); return interaction.reply({embeds:[new EmbedBuilder().setTitle(`🎨 ${u.username}`).setImage(b).setColor(C('#5865F2'))]}); }

  // ══ BOUTIQUE ══
  if (cmd==='shop') return interaction.reply({ embeds:[buildShopEmbed()] });

  if (cmd==='article') { const a=db.articles.find(x=>x.name.toLowerCase().includes(interaction.options.getString('nom').toLowerCase())); if(!a) return interaction.reply({embeds:[ERR('Introuvable.')],ephemeral:true}); return interaction.reply({embeds:[articleEmbed(a)]}); }

  if (cmd==='ajouter-article') {
    const art={ id:Date.now(), name:interaction.options.getString('nom'), price:interaction.options.getString('prix'), link:interaction.options.getString('lien'), description:interaction.options.getString('description')||'', emoji:interaction.options.getString('emoji')||'🛒', stock:interaction.options.getInteger('stock')??-1, image:interaction.options.getString('image')||'', visible:true, createdAt:new Date().toLocaleString('fr-FR') };
    db.articles.push(art);
    return interaction.reply({embeds:[OK('Article ajouté !',`**${art.emoji} ${art.name}** — ${art.price}`)]});
  }

  if (cmd==='supprimer-article') { const nom=interaction.options.getString('nom').toLowerCase(); const idx=db.articles.findIndex(a=>a.name.toLowerCase().includes(nom)); if(idx<0) return interaction.reply({embeds:[ERR('Introuvable.')],ephemeral:true}); const a=db.articles.splice(idx,1)[0]; return interaction.reply({embeds:[OK('Article supprimé',`**${a.name}** retiré.`)]}); }

  if (cmd==='liste-articles') { if(!db.articles.length) return interaction.reply({embeds:[INF('Boutique vide','Utilisez `/ajouter-article`.')]}); const emb=new EmbedBuilder().setTitle(`🛒 Articles (${db.articles.length})`).setColor(C('#f0b429')).setTimestamp(); db.articles.forEach(a=>emb.addFields({name:`${a.emoji} ${a.name}`,value:`${a.price} • ${a.stock===-1?'♾️':a.stock===0?'❌':'✅ '+a.stock}`,inline:true})); return interaction.reply({embeds:[emb]}); }

  if (cmd==='publier-shop') { const target=interaction.options.getChannel('channel')||interaction.channel, mention=interaction.options.getString('mention')||''; await target.send({content:mention||undefined,embeds:[buildShopEmbed()]}); return interaction.reply({embeds:[OK('Boutique publiée !',`Dans ${target}.`)],ephemeral:true}); }

  if (cmd==='paiements') { const cfg=db.boutiqueConfig; const emb=new EmbedBuilder().setTitle('💳 Moyens de Paiement').setColor(C('#10d982')).setTimestamp(); if(cfg.stripeLien)emb.addFields({name:'💳 Carte bancaire (Stripe)',value:`[→ Payer par carte](${cfg.stripeLien})`,inline:true}); if(cfg.sumupLien)emb.addFields({name:'💳 Sumup',value:`[→ Payer via Sumup](${cfg.sumupLien})`,inline:true}); if(cfg.emailPaiement)emb.addFields({name:'💶 Virement',value:`\`${cfg.emailPaiement}\``,inline:false}); emb.addFields({name:'🎫 Commander',value:'Ouvrez un ticket avec `/ticket`',inline:false}); return interaction.reply({embeds:[emb]}); }

  if (cmd==='contact') { const cfg=db.boutiqueConfig; const emb=new EmbedBuilder().setTitle(`📧 Contact — ${cfg.nom||'NexusStore'}`).setColor(C('#4d8fff')).setTimestamp(); if(cfg.emailContact)emb.addFields({name:'📧 Email',value:`\`${cfg.emailContact}\``,inline:false}); emb.addFields({name:'🎫 Support',value:'Ouvrez un ticket avec `/ticket`',inline:false}); const btns=[new ButtonBuilder().setLabel('🎫 Ouvrir un ticket').setStyle(ButtonStyle.Primary).setCustomId('t_open_sup')]; if(cfg.emailContact)btns.unshift(new ButtonBuilder().setLabel('📧 Email').setStyle(ButtonStyle.Link).setURL(`mailto:${cfg.emailContact}`)); return interaction.reply({embeds:[emb],components:[new ActionRowBuilder().addComponents(...btns)]}); }

  // ══ MODÉRATION ══
  if (cmd==='warn') { const t=interaction.options.getMember('membre'),r=interaction.options.getString('raison'); if(!db.warns[t.id])db.warns[t.id]=[]; db.warns[t.id].push({reason:r,modId:interaction.user.id,date:new Date().toLocaleString('fr-FR')}); const total=db.warns[t.id].length; await interaction.reply({embeds:[new EmbedBuilder().setTitle('⚠️ Avertissement').setColor(C('#f0b429')).addFields({name:'👤 Membre',value:`${t}`,inline:true},{name:'📝 Raison',value:r,inline:true},{name:'🔢 Total',value:`${total}`,inline:true}).setTimestamp()]}); t.send({embeds:[new EmbedBuilder().setTitle('⚠️ Avertissement reçu').setDescription(`**Serveur :** ${interaction.guild.name}\n**Raison :** ${r}\n**Total :** ${total}`).setColor(C('#f0b429')).setTimestamp()]}).catch(()=>{}); if(CH_LOGS){const l=interaction.guild.channels.cache.get(CH_LOGS);if(l)l.send({embeds:[new EmbedBuilder().setTitle('⚠️ Warn').setColor(C('#f0b429')).addFields({name:'Membre',value:`${t.user.tag} (${t.id})`},{name:'Raison',value:r},{name:'Modérateur',value:interaction.user.username},{name:'Total',value:`${total}`}).setTimestamp()]});}if(db.modConfig.autosanction&&total>=3)t.timeout(10*60000,'3 warns').catch(()=>{}); return; }

  if (cmd==='warns') { const t=interaction.options.getMember('membre'),warns=db.warns[t.id]||[]; const emb=new EmbedBuilder().setTitle(`⚠️ Warns — ${t.user.username}`).setColor(C('#f0b429')); if(!warns.length)emb.setDescription('✅ Aucun avertissement.'); else warns.forEach((w,i)=>emb.addFields({name:`#${i+1} • ${w.date}`,value:w.reason})); return interaction.reply({embeds:[emb]}); }

  if (cmd==='clearwarns') { const t=interaction.options.getMember('membre'); db.warns[t.id]=[]; return interaction.reply({embeds:[OK('Warns effacés',`Warns de ${t} supprimés.`)]}); }

  if (cmd==='sanctions') { const t=interaction.options.getMember('membre'),warns=db.warns[t.id]||[]; const emb=new EmbedBuilder().setTitle(`📋 ${t.user.username}`).setColor(C('#ff4d4d')).addFields({name:'⚠️ Warns',value:`${warns.length}`,inline:true},{name:'💰 Points',value:`${getUser(t.id).points}`,inline:true}); warns.forEach((w,i)=>emb.addFields({name:`#${i+1}`,value:`${w.date}: ${w.reason}`})); return interaction.reply({embeds:[emb]}); }

  if (cmd==='kick') { const t=interaction.options.getMember('membre'),r=interaction.options.getString('raison')||'Aucune raison'; if(!t.kickable)return interaction.reply({embeds:[ERR('Impossible.')],ephemeral:true}); t.send({embeds:[ERR(`Expulsé de **${interaction.guild.name}**. Raison : ${r}`)]}).catch(()=>{}); await t.kick(r); await interaction.reply({embeds:[new EmbedBuilder().setTitle('👢 Expulsé').setColor(C('#ff4d4d')).addFields({name:'Membre',value:t.user.username,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()]}); if(CH_LOGS){const l=interaction.guild.channels.cache.get(CH_LOGS);if(l)l.send({embeds:[new EmbedBuilder().setTitle('👢 Kick').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${t.user.tag} (${t.id})`},{name:'Raison',value:r},{name:'Mod',value:interaction.user.username}).setTimestamp()]}); }return; }

  if (cmd==='ban') { const t=interaction.options.getMember('membre'),r=interaction.options.getString('raison')||'Aucune raison'; if(!t.bannable)return interaction.reply({embeds:[ERR('Impossible.')],ephemeral:true}); t.send({embeds:[ERR(`Banni de **${interaction.guild.name}**. Raison : ${r}`)]}).catch(()=>{}); await t.ban({reason:r}); await interaction.reply({embeds:[new EmbedBuilder().setTitle('🔨 Banni').setColor(C('#ff4d4d')).addFields({name:'Membre',value:t.user.username,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()]}); if(CH_LOGS){const l=interaction.guild.channels.cache.get(CH_LOGS);if(l)l.send({embeds:[new EmbedBuilder().setTitle('🔨 Ban').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${t.user.tag} (${t.id})`},{name:'Raison',value:r},{name:'Mod',value:interaction.user.username}).setTimestamp()]}); }return; }

  if (cmd==='unban') { try{await interaction.guild.members.unban(interaction.options.getString('userid'));return interaction.reply({embeds:[OK('Débanni','')]});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  if (cmd==='mute') { const t=interaction.options.getMember('membre'),min=interaction.options.getInteger('minutes')||10,r=interaction.options.getString('raison')||'Aucune raison'; try{await t.timeout(min*60000,r); t.send({embeds:[new EmbedBuilder().setTitle('🔇 Sourdine').setDescription(`**Durée :** ${min}min\n**Raison :** ${r}`).setColor(C('#4d8fff')).setTimestamp()]}).catch(()=>{}); return interaction.reply({embeds:[new EmbedBuilder().setTitle('🔇 Sourdine').setColor(C('#f0b429')).addFields({name:'Membre',value:`${t}`,inline:true},{name:'Durée',value:`${min}min`,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()]});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  if (cmd==='unmute') { try{await interaction.options.getMember('membre').timeout(null);return interaction.reply({embeds:[OK('Sourdine levée','')]});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  if (cmd==='clear') { try{const d=await interaction.channel.bulkDelete(interaction.options.getInteger('nombre'),true);return interaction.reply({embeds:[OK(`${d.size} messages supprimés`,'')],ephemeral:true});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  if (cmd==='lock')     { await interaction.channel.permissionOverwrites.edit(interaction.guild.id,{SendMessages:false}); return interaction.reply({embeds:[new EmbedBuilder().setTitle('🔒 Salon verrouillé').setColor(C('#ff4d4d')).setTimestamp()]}); }
  if (cmd==='unlock')   { await interaction.channel.permissionOverwrites.edit(interaction.guild.id,{SendMessages:null}); return interaction.reply({embeds:[new EmbedBuilder().setTitle('🔓 Salon déverrouillé').setColor(C('#10d982')).setTimestamp()]}); }
  if (cmd==='slowmode') { await interaction.channel.setRateLimitPerUser(interaction.options.getInteger('secondes')); return interaction.reply({embeds:[OK('Slow mode mis à jour','')]}); }

  if (cmd==='automod') { const as=interaction.options.getBoolean('antispam'),al=interaction.options.getBoolean('antilink'),ac=interaction.options.getBoolean('anticaps'); if(as!==null)db.modConfig.antispam=as; if(al!==null)db.modConfig.antilink=al; if(ac!==null)db.modConfig.anticaps=ac; return interaction.reply({embeds:[new EmbedBuilder().setTitle('⚙️ Auto-Mod mis à jour').setColor(C('#10d982')).addFields({name:'🚨 Anti-spam',value:db.modConfig.antispam?'✅':'❌',inline:true},{name:'🔗 Anti-lien',value:db.modConfig.antilink?'✅':'❌',inline:true},{name:'🔠 Anti-caps',value:db.modConfig.anticaps?'✅':'❌',inline:true}).setTimestamp()]}); }

  if (cmd==='mot-interdit') { const action=interaction.options.getString('action'),mot=interaction.options.getString('mot'); if(action==='add'&&mot){if(!db.modConfig.bannedWords.includes(mot.toLowerCase()))db.modConfig.bannedWords.push(mot.toLowerCase());return interaction.reply({embeds:[OK('Mot banni',`\`${mot}\` supprimé automatiquement.`)]}); } if(action==='remove'&&mot){db.modConfig.bannedWords=db.modConfig.bannedWords.filter(w=>w!==mot.toLowerCase());return interaction.reply({embeds:[OK('Mot retiré',`\`${mot}\` retiré.`)]}); } return interaction.reply({embeds:[INF('Mots interdits',db.modConfig.bannedWords.length?db.modConfig.bannedWords.map(w=>`\`${w}\``).join(', '):'Aucun.')]}); }

  // ══ TICKETS ══
  if (cmd==='ticket') {
    const cats = db.ticketCategories;
    if (cats.length === 1) {
      await interaction.deferReply({ ephemeral:true });
      try { const r=await openTicket(interaction.guild,interaction.user,cats[0].id); if(r.already)return interaction.editReply({content:`❌ Ticket existant : <#${r.channel.id}>`}); return interaction.editReply({content:`✅ Ticket créé : <#${r.channel.id}>`}); } catch(e){return interaction.editReply({content:`❌ ${e.message}`});}
    }
    // Plusieurs catégories → menu déroulant
    const options = cats.map(c=>({ label:c.label, description:c.desc, value:c.id }));
    const menu = new StringSelectMenuBuilder().setCustomId('ticket_category').setPlaceholder('📋 Choisissez une catégorie...').addOptions(options);
    return interaction.reply({ content:'📋 Choisissez la catégorie de votre ticket :', components:[new ActionRowBuilder().addComponents(menu)], ephemeral:true });
  }

  if (cmd==='setup-tickets') {
    const target = interaction.options.getChannel('channel');
    await sendTicketPanel(target);
    return interaction.reply({ embeds:[OK('Panel tickets installé !',`Le panel de tickets a été installé dans ${target}.`)], ephemeral:true });
  }

  if (cmd==='fermer') { if(!interaction.channel.name.startsWith('ticket-'))return interaction.reply({embeds:[ERR('Pas dans un ticket.')],ephemeral:true}); await interaction.reply({content:'🔒 Fermeture dans 10s...'}); return closeTicket(interaction.channel,interaction.user); }

  if (cmd==='add') { const t=interaction.options.getMember('membre'); await interaction.channel.permissionOverwrites.edit(t.id,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true}); return interaction.reply({embeds:[OK('Membre ajouté',`${t} a maintenant accès.`)]}); }
  if (cmd==='retirer') { const t=interaction.options.getMember('membre'); await interaction.channel.permissionOverwrites.edit(t.id,{ViewChannel:false}); return interaction.reply({embeds:[OK('Membre retiré',`${t} n\'a plus accès.`)]}); }

  if (cmd==='ajouter-categorie') {
    const id=interaction.options.getString('id').toLowerCase().replace(/\s+/g,'-'),label=interaction.options.getString('label'),desc=interaction.options.getString('description'),color=interaction.options.getString('couleur')||'#5865F2';
    if (db.ticketCategories.find(c=>c.id===id)) return interaction.reply({embeds:[ERR(`Catégorie \`${id}\` déjà existante.`)],ephemeral:true});
    db.ticketCategories.push({id,label,desc,color});
    return interaction.reply({embeds:[OK('Catégorie ajoutée !',`**${label}** ajoutée.\nUtilisez \`/setup-tickets\` pour mettre à jour le panel.`)]});
  }

  // ══ ÉCONOMIE ══
  if (cmd==='points') { const t=interaction.options.getUser('membre')||interaction.user; const u=getUser(t.id); return interaction.reply({embeds:[new EmbedBuilder().setTitle(`💰 ${t.username}`).setThumbnail(t.displayAvatarURL({dynamic:true})).setColor(C('#f0b429')).addFields({name:'💰 Points',value:`**${u.points}**`,inline:true},{name:'🏆 Rang',value:`#${rank(t.id)}`,inline:true},{name:'📈 Total gagné',value:`${u.totalEarned}`,inline:true}).setTimestamp()]}); }

  if (cmd==='niveau') { const t=interaction.options.getUser('membre')||interaction.user; const u=getUser(t.id); const needed=u.level*100,pct=Math.floor((u.xp/needed)*100); const bar='█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10)); return interaction.reply({embeds:[new EmbedBuilder().setTitle(`⭐ Niveau — ${t.username}`).setThumbnail(t.displayAvatarURL({dynamic:true})).setColor(C('#9d6fff')).addFields({name:'⭐ Niveau',value:`**${u.level}**`,inline:true},{name:'📊 XP',value:`${u.xp}/${needed}`,inline:true},{name:'💬 Messages',value:`${u.messages||0}`,inline:true},{name:'📈 Progression',value:`[${bar}] ${pct}%`,inline:false}).setTimestamp()]}); }

  if (cmd==='daily') { const u=getUser(interaction.user.id); const cd=24*3600000; if(Date.now()-u.lastDaily<cd){const h=Math.ceil((cd-(Date.now()-u.lastDaily))/3600000);return interaction.reply({embeds:[ERR(`Reviens dans **${h}h**.`)],ephemeral:true});} const gain=Math.floor(Math.random()*151)+50; u.lastDaily=Date.now(); addPts(interaction.user.id,gain); addXP(interaction.user.id,20); return interaction.reply({embeds:[new EmbedBuilder().setTitle('🎁 Daily récupéré !').setDescription(`+**${gain} points** !\nTotal : **${u.points} points**`).setColor(C('#10d982')).setTimestamp()]}); }

  if (cmd==='classement') { const top=Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,10); const medals=['🥇','🥈','🥉']; return interaction.reply({embeds:[new EmbedBuilder().setTitle('🏆 Classement Points').setDescription(top.length?top.map(([id,d],i)=>`${medals[i]||`**${i+1}.**`} <@${id}> — **${d.points} pts**`).join('\n'):'Aucun').setColor(C('#f0b429')).setTimestamp()]}); }

  if (cmd==='classement-xp') { const top=Object.entries(db.economy).sort(([,a],[,b])=>b.level-a.level).slice(0,10); const medals=['🥇','🥈','🥉']; return interaction.reply({embeds:[new EmbedBuilder().setTitle('⭐ Classement Niveaux').setDescription(top.length?top.map(([id,d],i)=>`${medals[i]||`**${i+1}.**`} <@${id}> — Niv.**${d.level}** (${d.xp} XP)`).join('\n'):'Aucun').setColor(C('#9d6fff')).setTimestamp()]}); }

  if (cmd==='donner-points') { const t=interaction.options.getUser('membre'),n=interaction.options.getInteger('montant'); addPts(t.id,n); return interaction.reply({embeds:[OK('Points donnés',`**+${n} pts** à <@${t.id}>. Total : **${getUser(t.id).points} pts**`)]}); }
  if (cmd==='retirer-points') { const t=interaction.options.getUser('membre'),n=interaction.options.getInteger('montant'); const u=getUser(t.id); u.points=Math.max(0,u.points-n); return interaction.reply({embeds:[OK('Points retirés',`**-${n} pts** à <@${t.id}>. Solde : **${u.points} pts**`)]}); }

  if (cmd==='shop-roles') { if(!db.roleShop.length)return interaction.reply({embeds:[INF('Vide','Aucun rôle en vente.')]}); const u=getUser(interaction.user.id); const emb=new EmbedBuilder().setTitle('🛍️ Boutique de Rôles').setColor(C('#f0b429')).setDescription(`Vos points : **${u.points} pts**`); db.roleShop.forEach(r=>{const role=interaction.guild.roles.cache.get(r.roleId);if(role)emb.addFields({name:`@${role.name}`,value:`${r.price} points`,inline:true});}); return interaction.reply({embeds:[emb]}); }
  if (cmd==='acheter-role') { const role=interaction.options.getRole('role'),item=db.roleShop.find(r=>r.roleId===role.id); if(!item)return interaction.reply({embeds:[ERR('Pas en vente.')],ephemeral:true}); const u=getUser(interaction.user.id); if(u.points<item.price)return interaction.reply({embeds:[ERR(`Il faut **${item.price} pts**.`)],ephemeral:true}); u.points-=item.price; await interaction.member.roles.add(role); return interaction.reply({embeds:[OK('Rôle acheté !',`**@${role.name}** pour **${item.price} pts** !\nSolde : **${u.points} pts**`)]}); }
  if (cmd==='ajouter-role-shop') { const role=interaction.options.getRole('role'),prix=interaction.options.getInteger('prix'),i=db.roleShop.findIndex(r=>r.roleId===role.id); if(i>=0)db.roleShop[i].price=prix;else db.roleShop.push({roleId:role.id,price:prix}); return interaction.reply({embeds:[OK('Rôle en vente !',`**@${role.name}** — **${prix} points**`)]}); }
  if (cmd==='role-niveau') { const niv=interaction.options.getInteger('niveau'),role=interaction.options.getRole('role'),i=db.levelRoles.findIndex(lr=>lr.level===niv); if(i>=0)db.levelRoles[i].roleId=role.id;else db.levelRoles.push({level:niv,roleId:role.id}); return interaction.reply({embeds:[OK('Configuré !',`Au niveau **${niv}** → **@${role.name}**.`)]}); }

  // ══ RÉPUTATION ══
  if (cmd==='rep') { const t=interaction.options.getUser('membre'); if(t.id===interaction.user.id)return interaction.reply({embeds:[ERR('Tu ne peux pas te donner de réputation.')],ephemeral:true}); const my=getRep(interaction.user.id); const cd=12*3600000; if(Date.now()-my.lastGiven<cd){const h=Math.ceil((cd-(Date.now()-my.lastGiven))/3600000);return interaction.reply({embeds:[ERR(`Reviens dans **${h}h**.`)],ephemeral:true});} my.lastGiven=Date.now(); const their=getRep(t.id); their.total++; addPts(t.id,10); return interaction.reply({embeds:[new EmbedBuilder().setTitle('⭐ Réputation donnée !').setDescription(`Tu as donné ⭐ à <@${t.id}> !\nIl a maintenant **${their.total} ⭐**.`).setColor(C('#f0b429')).setTimestamp()]}); }
  if (cmd==='ma-rep') { const t=interaction.options.getUser('membre')||interaction.user; const r=getRep(t.id); return interaction.reply({embeds:[new EmbedBuilder().setTitle(`⭐ Réputation — ${t.username}`).setDescription(`**${t.username}** a **${r.total} ⭐** de réputation.`).setColor(C('#f0b429')).setTimestamp()]}); }

  // ══ GIVEAWAY ══
  if (cmd==='giveaway') { const prix=interaction.options.getString('prix'),minutes=interaction.options.getInteger('minutes'),nb=interaction.options.getInteger('gagnants')||1,target=interaction.options.getChannel('channel')||interaction.channel,end=Date.now()+minutes*60000; const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gw_join').setLabel('🎉 Participer').setStyle(ButtonStyle.Primary)); const msg=await target.send({embeds:[new EmbedBuilder().setTitle('🎉 GIVEAWAY').setDescription(`**🏆 Prix :** ${prix}\n\n⏱️ **Fin :** ${new Date(end).toLocaleString('fr-FR')}\n👥 **Participants :** 0\n🎊 **Gagnants :** ${nb}\n\nClique sur le bouton pour participer !`).setColor(C('#f0b429')).setTimestamp(new Date(end)).setFooter({text:`Par ${interaction.user.username}`})],components:[row]}); db.giveaways[msg.id]={prize:prix,end,channel:target.id,entries:new Set(),ended:false,winners:nb}; return interaction.reply({embeds:[OK('Giveaway créé !',`**${prix}** — ${minutes}min — ${nb} gagnant(s)`)],ephemeral:true}); }
  if (cmd==='giveaway-fin') { const id=interaction.options.getString('messageid'); if(!db.giveaways[id])return interaction.reply({embeds:[ERR('Introuvable.')],ephemeral:true}); await endGiveaway(id,interaction.guild); return interaction.reply({embeds:[OK('Terminé !','')],ephemeral:true}); }
  if (cmd==='giveaway-reroll') { const gw=db.giveaways[interaction.options.getString('messageid')]; if(!gw)return interaction.reply({embeds:[ERR('Introuvable.')],ephemeral:true}); const entries=[...gw.entries]; if(!entries.length)return interaction.reply({embeds:[ERR('Aucun participant.')],ephemeral:true}); const winner=entries[Math.floor(Math.random()*entries.length)]; gw.winner=winner; addPts(winner,100); return interaction.reply({embeds:[new EmbedBuilder().setTitle('🔄 Nouveau Gagnant !').setDescription(`**Prix :** ${gw.prize}\n**Gagnant :** <@${winner}>`).setColor(C('#10d982')).setTimestamp()]}); }

  // ══ SONDAGES ══
  if (cmd==='sondage') { const question=interaction.options.getString('question'),opts=interaction.options.getString('options').split('|').map(s=>s.trim()).filter(Boolean).slice(0,9); if(opts.length<2)return interaction.reply({embeds:[ERR('Minimum 2 options.')],ephemeral:true}); const emojis=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣']; const msg=await interaction.reply({embeds:[new EmbedBuilder().setTitle(`📊 ${question}`).setDescription(opts.map((o,i)=>`${emojis[i]} ${o}`).join('\n')).setColor(C('#4d8fff')).setTimestamp().setFooter({text:`Par ${interaction.user.username} • Réagissez pour voter`})],fetchReply:true}); db.polls[msg.id]={question,options:opts,votes:Object.fromEntries(opts.map((_,i)=>[i,[]]))}; for(let i=0;i<opts.length;i++)await msg.react(emojis[i]); return; }
  if (cmd==='resultats') { const poll=db.polls[interaction.options.getString('messageid')]; if(!poll)return interaction.reply({embeds:[ERR('Introuvable.')],ephemeral:true}); const total=Object.values(poll.votes).reduce((s,v)=>s+v.length,0); const emb=new EmbedBuilder().setTitle(`📊 ${poll.question}`).setColor(C('#4d8fff')); poll.options.forEach((o,i)=>{const votes=poll.votes[i]?.length||0,pct=total>0?Math.round((votes/total)*100):0; emb.addFields({name:o,value:`${'█'.repeat(Math.floor(pct/10))}${'░'.repeat(10-Math.floor(pct/10))} **${pct}%** (${votes} vote(s))`,inline:false});}); emb.setFooter({text:`${total} vote(s) total`}).setTimestamp(); return interaction.reply({embeds:[emb]}); }

  // ══ RÔLES ══
  if (cmd==='reaction-role') { const titre=interaction.options.getString('titre'),paires=interaction.options.getString('paires'),target=interaction.options.getChannel('channel')||interaction.channel; const pairs=paires.split('|').map(p=>p.trim()).filter(Boolean),rrMap={},lines=[]; for(const p of pairs){const[emoji,roleId]=p.split(':');if(!emoji||!roleId)continue;rrMap[emoji.trim()]=roleId.trim();const role=interaction.guild.roles.cache.get(roleId.trim());lines.push(`${emoji.trim()} → ${role?`@${role.name}`:roleId}`);}const msg=await target.send({embeds:[new EmbedBuilder().setTitle(titre).setDescription('Réagissez pour obtenir un rôle :\n\n'+lines.join('\n')).setColor(C('#f0b429')).setTimestamp()]});db.reactionRoles[msg.id]=rrMap;for(const emoji of Object.keys(rrMap))await msg.react(emoji).catch(()=>{});return interaction.reply({embeds:[OK('Reaction roles créé !',`${Object.keys(rrMap).length} rôle(s) dans ${target}`)],ephemeral:true}); }

  if (cmd==='donner-role') { const t=interaction.options.getMember('membre'),r=interaction.options.getRole('role'); try{await t.roles.add(r);return interaction.reply({embeds:[OK('Rôle donné',`**@${r.name}** → ${t}`)],ephemeral:true});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }
  if (cmd==='retirer-role') { const t=interaction.options.getMember('membre'),r=interaction.options.getRole('role'); try{await t.roles.remove(r);return interaction.reply({embeds:[OK('Rôle retiré',`**@${r.name}** retiré de ${t}`)],ephemeral:true});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  // ══ MESSAGES ══
  if (cmd==='annonce') { const target=interaction.options.getChannel('channel')||interaction.channel,ment=interaction.options.getString('mention')||'',img=interaction.options.getString('image')||''; const emb=new EmbedBuilder().setTitle(`📢 ${interaction.options.getString('titre')}`).setDescription(interaction.options.getString('message')).setColor(C(interaction.options.getString('couleur')||'#5865F2')).setTimestamp().setFooter({text:`Annoncé par ${interaction.user.username}`}); if(img)emb.setImage(img); await target.send({content:ment||undefined,embeds:[emb]}); return interaction.reply({embeds:[OK('Annonce envoyée',`Dans ${target}.`)],ephemeral:true}); }

  if (cmd==='message-perso') { const target=interaction.options.getChannel('channel')||interaction.channel; await target.send({content:interaction.options.getString('contenu')}); return interaction.reply({embeds:[OK('Message envoyé',`Dans ${target}.`)],ephemeral:true}); }

  if (cmd==='boutons') { const titre=interaction.options.getString('titre'),desc=interaction.options.getString('description')||'',couleur=interaction.options.getString('couleur')||'#5865F2',target=interaction.options.getChannel('channel')||interaction.channel,mention=interaction.options.getString('mention')||''; const btnsRaw=['btn1','btn2','btn3'].map(k=>interaction.options.getString(k)).filter(Boolean); const buttons=btnsRaw.map(raw=>{const[label,url]=raw.split('|');return url?.startsWith('http')?new ButtonBuilder().setLabel(label.trim()).setStyle(ButtonStyle.Link).setURL(url.trim()):null;}).filter(Boolean); if(!buttons.length)return interaction.reply({embeds:[ERR('Aucun bouton valide.')],ephemeral:true}); const emb=new EmbedBuilder().setTitle(titre).setColor(C(couleur)).setTimestamp(); if(desc)emb.setDescription(desc); const payload={embeds:[emb],components:[new ActionRowBuilder().addComponents(...buttons)]}; if(mention)payload.content=mention; await target.send(payload); return interaction.reply({embeds:[OK(`${buttons.length} bouton(s) envoyé(s) !`,`Dans ${target}.`)],ephemeral:true}); }

  if (cmd==='sticky') { const msg=interaction.options.getString('message'); if(!msg){delete db.sticky[interaction.channel.id];return interaction.reply({embeds:[OK('Sticky supprimé','')]});} db.sticky[interaction.channel.id]={content:msg,msgId:''}; const m=await interaction.channel.send({embeds:[new EmbedBuilder().setDescription(`📌 **Message épinglé**\n\n${msg}`).setColor(C('#5865F2'))]}); db.sticky[interaction.channel.id].msgId=m.id; return interaction.reply({embeds:[OK('Sticky activé','')],ephemeral:true}); }

  if (cmd==='epingler') { try{const msg=await interaction.channel.messages.fetch(interaction.options.getString('messageid'));await msg.pin();return interaction.reply({embeds:[OK('Épinglé !','')]});}catch(e){return interaction.reply({embeds:[ERR(e.message)],ephemeral:true});} }

  // ══ FUN ══
  const BLAGUES=['Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon ils tomberaient dans le bateau ! 😄','C\'est l\'histoire d\'un homme dans une bibliothèque qui demande un steak. Le bibliothécaire : "Chut !" L\'homme murmure : "Désolé... un steak svp." 🤫','Qu\'est-ce qu\'un crocodile qui surveille des tapis ? Un tapi-coa ! 🐊','Pourquoi l\'épouvantail a-t-il reçu un prix ? Parce qu\'il était exceptionnel dans son domaine ! 🌾','Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ? Un chat-peint de Noël ! 🎨','Qu\'est-ce que le mariage ? C\'est un contrat entre deux personnes dont l\'une a toujours raison... et c\'est la femme ! 💍'];
  const CITATIONS=['La vie c\'est comme une bicyclette, il faut avancer pour ne pas perdre l\'équilibre. — Einstein','Le succès c\'est d\'aller d\'échec en échec sans perdre son enthousiasme. — Churchill','La seule façon de faire du bon travail est d\'aimer ce que vous faites. — Jobs','L\'imagination est plus importante que le savoir. — Einstein','Sois le changement que tu veux voir dans le monde. — Gandhi','La créativité c\'est l\'intelligence qui s\'amuse. — Einstein'];
  const BOULE=['Oui, absolument ! ✅','Tout à fait ! 💯','C\'est certain ! 🎯','Selon moi, oui ! 👍','Réponse floue... 🌫️','Demande plus tard ⏳','Je ne suis pas sûr... 🤔','Mes sources disent non ! ❌','Très improbable ! 👎','Non, définitivement ! 🚫','Concentre-toi et redemande ! 🔮','Les signes pointent vers oui ! ✨'];

  if (cmd==='blague') { return interaction.reply({embeds:[new EmbedBuilder().setTitle('😂 Blague du jour').setDescription(BLAGUES[Math.floor(Math.random()*BLAGUES.length)]).setColor(C('#f0b429')).setTimestamp()]}); }
  if (cmd==='pile-ou-face') { const res=Math.random()>0.5; return interaction.reply({embeds:[new EmbedBuilder().setTitle('🪙 Pile ou Face ?').setDescription(`C'est... **${res?'PILE 🟡':'FACE ⚪'}** !`).setColor(C(res?'#f0b429':'#8b90a0')).setTimestamp()]}); }
  if (cmd==='des') { const faces=interaction.options.getInteger('faces')||6,result=Math.floor(Math.random()*faces)+1; return interaction.reply({embeds:[new EmbedBuilder().setTitle('🎲 Lancer de dé').setDescription(`Dé à **${faces} faces** → **${result}** !`).setColor(C('#9d6fff')).setTimestamp()]}); }
  if (cmd==='choisir') { const opts=interaction.options.getString('options').split('|').map(s=>s.trim()).filter(Boolean); if(!opts.length)return interaction.reply({embeds:[ERR('Au moins 2 options.')],ephemeral:true}); const chosen=opts[Math.floor(Math.random()*opts.length)]; return interaction.reply({embeds:[new EmbedBuilder().setTitle('🎯 Choix aléatoire').setDescription(`Parmi **${opts.length}** options :\n\n**→ ${chosen}**`).setColor(C('#10d982')).setTimestamp()]}); }
  if (cmd==='citation') { return interaction.reply({embeds:[new EmbedBuilder().setTitle('💬 Citation').setDescription(`*"${CITATIONS[Math.floor(Math.random()*CITATIONS.length)]}"*`).setColor(C('#4d8fff')).setTimestamp()]}); }
  if (cmd==='8ball') { const q=interaction.options.getString('question'),rep=BOULE[Math.floor(Math.random()*BOULE.length)]; return interaction.reply({embeds:[new EmbedBuilder().setTitle('🎱 Boule Magique').addFields({name:'❓ Question',value:q},{name:'🎱 Réponse',value:`**${rep}**`}).setColor(C('#9d6fff')).setTimestamp()]}); }

  if (cmd==='compteur') {
    const g=interaction.guild; await g.members.fetch();
    const total=g.memberCount,humans=g.members.cache.filter(m=>!m.user.bot).size,bots=g.members.cache.filter(m=>m.user.bot).size;
    const online=g.members.cache.filter(m=>!m.user.bot&&m.presence?.status==='online').size;
    const idle=g.members.cache.filter(m=>!m.user.bot&&m.presence?.status==='idle').size;
    const dnd=g.members.cache.filter(m=>!m.user.bot&&m.presence?.status==='dnd').size;
    return interaction.reply({embeds:[new EmbedBuilder().setTitle(`📊 Comptage — ${g.name}`).setColor(C('#5865F2')).addFields(
      {name:'👥 Total',value:`**${total}**`,inline:true},{name:'👤 Humains',value:`**${humans}**`,inline:true},{name:'🤖 Bots',value:`**${bots}**`,inline:true},
      {name:'🟢 En ligne',value:`**${online}**`,inline:true},{name:'🟡 Absent',value:`**${idle}**`,inline:true},{name:'🔴 DND',value:`**${dnd}**`,inline:true},
      {name:'⚫ Hors ligne',value:`**${humans-online-idle-dnd}**`,inline:true},{name:'🎤 En vocal',value:`**${Object.keys(db.voiceActive).length}**`,inline:true},
    ).setTimestamp()]});
  }

  // ══ RAPPELS & ANNIVERSAIRES ══
  if (cmd==='rappel') { const min=interaction.options.getInteger('minutes'),msg=interaction.options.getString('message'); db.reminders.push({userId:interaction.user.id,channelId:interaction.channel.id,msg,time:Date.now()+min*60000}); const d=min>=60?`${Math.floor(min/60)}h ${min%60}m`:`${min}min`; return interaction.reply({embeds:[new EmbedBuilder().setTitle('⏰ Rappel créé !').setDescription(`Je te rappellerai dans **${d}** :\n\n*${msg}*`).setColor(C('#10d982')).setTimestamp()],ephemeral:true}); }

  if (cmd==='anniversaire') { const date=interaction.options.getString('date'); if(!/^\d{2}\/\d{2}$/.test(date))return interaction.reply({embeds:[ERR('Format invalide. Utilisez JJ/MM (ex: 25/12).')],ephemeral:true}); db.birthdays[interaction.user.id]=date; return interaction.reply({embeds:[OK('Anniversaire enregistré !',`Ton anniversaire est le **${date}** 🎂\nTu recevras une mention + 100 points ce jour-là !`)],ephemeral:true}); }

  if (cmd==='prochains-anniversaires') { const today=new Date(); const upcoming=Object.entries(db.birthdays).map(([id,d])=>{const[day,month]=d.split('/').map(Number);const next=new Date(today.getFullYear(),month-1,day);if(next<today)next.setFullYear(today.getFullYear()+1);return{id,date:d,days:Math.ceil((next-today)/(1000*60*60*24))};}).sort((a,b)=>a.days-b.days).slice(0,10); const emb=new EmbedBuilder().setTitle('🎂 Prochains anniversaires').setColor(C('#f0b429')).setTimestamp(); if(!upcoming.length)emb.setDescription('Aucun anniversaire. Utilisez `/anniversaire`.'); else upcoming.forEach(({id,date,days})=>emb.addFields({name:`<@${id}>`,value:`📅 ${date} — Dans **${days} jour${days>1?'s':''}**`,inline:false})); return interaction.reply({embeds:[emb]}); }

  // ══ STATS VOCAUX ══
  if (cmd==='stats-vocaux') { const t=interaction.options.getUser('membre')||interaction.user; const vs=db.voiceStats[t.id]||{totalMinutes:0,sessions:0}; const h=Math.floor(vs.totalMinutes/60),m=vs.totalMinutes%60; const isActive=!!db.voiceActive[t.id]; return interaction.reply({embeds:[new EmbedBuilder().setTitle(`🎤 Stats Vocaux — ${t.username}`).setThumbnail(t.displayAvatarURL({dynamic:true})).setColor(C('#9d6fff')).addFields({name:'⏱️ Temps total',value:`**${h}h ${m}min**`,inline:true},{name:'🔗 Sessions',value:`**${vs.sessions}**`,inline:true},{name:'📍 Statut',value:isActive?'🟢 **En vocal**':'⚫ Hors vocal',inline:true}).setTimestamp()]}); }

  if (cmd==='classement-vocal') { const top=Object.entries(db.voiceStats).sort(([,a],[,b])=>b.totalMinutes-a.totalMinutes).slice(0,10); const medals=['🥇','🥈','🥉']; const emb=new EmbedBuilder().setTitle('🎤 Classement Temps Vocal').setColor(C('#9d6fff')).setTimestamp(); if(!top.length)emb.setDescription('Aucune donnée.'); else top.forEach(([id,vs],i)=>{const h=Math.floor(vs.totalMinutes/60),m=vs.totalMinutes%60;emb.addFields({name:`${medals[i]||`**${i+1}.**`} <@${id}>`,value:`⏱️ **${h}h ${m}min** • ${vs.sessions} session(s)`,inline:false});}); return interaction.reply({embeds:[emb]}); }

  if (cmd==='vocal-live') { const g=interaction.guild; const voiceChannels=g.channels.cache.filter(c=>c.type===ChannelType.GuildVoice); const emb=new EmbedBuilder().setTitle('🔴 Membres en vocal maintenant').setColor(C('#ff4d4d')).setTimestamp(); let total=0; const fields=[]; voiceChannels.forEach(vc=>{const members=vc.members.filter(m=>!m.user.bot);if(!members.size)return;total+=members.size;fields.push({name:`🔊 ${vc.name} (${members.size})`,value:members.map(m=>`${m.user.username}${m.voice.selfMute?' 🔇':m.voice.selfDeaf?' 🔕':''}`).join('\n'),inline:true});}); if(!fields.length)emb.setDescription('Personne en vocal actuellement.'); else{emb.setDescription(`**${total} membre${total>1?'s':''} en vocal**`);fields.forEach(f=>emb.addFields(f));} return interaction.reply({embeds:[emb]}); }

  // ══ SETUP ══
  const SALON_CONFIGS = { shop:{name:'🛒・boutique',topic:'Notre boutique'}, rules:{name:'📜・règles',topic:'Règles du serveur'}, welcome:{name:'👋・bienvenue',topic:'Bienvenue'}, tickets:{name:'🎫・tickets',topic:'Support'}, annonces:{name:'📢・annonces',topic:'Annonces officielles'}, general:{name:'💬・général',topic:'Discussion'}, classement:{name:'🏆・classement',topic:'Classements'}, vocaux:{name:'📊・stats-vocaux',topic:'Stats vocaux'}, };

  const RULES_DATA = {
    vente:[{e:'🤝',t:'Respect mutuel',d:'Aucune insulte ou toxicité tolérée.'},{e:'💰',t:'Transactions honnêtes',d:'Descriptions exactes obligatoires.'},{e:'🚫',t:'Zéro escroquerie',d:'Fraude = bannissement immédiat.'},{e:'📦',t:'Livraison',d:'Respectez les délais annoncés.'},{e:'🔒',t:'Confidentialité',d:'Ne partagez pas vos données perso.'},{e:'📢',t:'Pub interdite',d:'Aucune promo sans autorisation.'},{e:'🎫',t:'Tickets',d:'Tout litige → /ticket.'},{e:'🌍',t:'Français',d:'Salons généraux en français.'},{e:'⚖️',t:'Staff',d:'Décisions du staff définitives.'},{e:'🔞',t:'Âge',d:'Certains produits réservés aux majeurs.'}],
    gaming:[{e:'🎮',t:'Fair-play',d:'Pas de triche ni de toxicité.'},{e:'🤝',t:'Respect',d:'Aucune insulte.'},{e:'📢',t:'Anti-spam',d:'Pas de flood.'},{e:'🚫',t:'Contenu',d:'Pas de NSFW hors salons dédiés.'},{e:'🎤',t:'Vocaux',d:'Micro correct requis.'},{e:'🏆',t:'Compétitions',d:'Décisions arbitres finales.'},{e:'📱',t:'Self-promo',d:'Salon dédié uniquement.'},{e:'🔒',t:'Comptes',d:'Ne partagez pas vos identifiants.'},{e:'⚖️',t:'Sanctions',d:'Warn → Mute → Kick → Ban.'},{e:'🎫',t:'Support',d:'Problème → /ticket.'}],
    communaute:[{e:'💙',t:'Bienveillance',d:'Soutenez-vous mutuellement.'},{e:'🗣️',t:'Communication',d:'Désaccords ok, conflits non.'},{e:'🚫',t:'Discrimination',d:'Aucune sous aucune forme.'},{e:'📵',t:'Anti-spam',d:'Un message à la fois.'},{e:'🔞',t:'Contenu',d:'Respectez les restrictions d\'âge.'},{e:'🔒',t:'Vie privée',d:'Ne partagez pas d\'infos perso.'},{e:'📢',t:'Publicité',d:'Toute promo doit être approuvée.'},{e:'🎫',t:'Signalements',d:'Infraction → /ticket.'},{e:'🏅',t:'Rôles',d:'Gagnés par l\'activité.'},{e:'⚖️',t:'Modération',d:'Modérateurs ont le dernier mot.'}],
  };

  if (cmd==='generer-regles') { const type=interaction.options.getString('type'),target=interaction.options.getChannel('channel'); const rules=(RULES_DATA[type]||RULES_DATA.vente); const emb=new EmbedBuilder().setTitle('📜 Règles du Serveur').setColor(C('#e74c3c')).setTimestamp().setFooter({text:'Non-respect = sanctions'}); rules.forEach((r,i)=>emb.addFields({name:`${r.e} ${i+1}. ${r.t}`,value:r.d})); if(target){await target.send({embeds:[emb]});return interaction.reply({embeds:[OK('Règles publiées !',`Dans ${target}.`)],ephemeral:true});}return interaction.reply({embeds:[emb]}); }

  if (cmd==='setup-salon') { const type=interaction.options.getString('type'),config=SALON_CONFIGS[type]; if(!config)return interaction.reply({embeds:[ERR('Type invalide.')],ephemeral:true}); await interaction.deferReply({ephemeral:true}); try{const ch=await interaction.guild.channels.create({name:config.name,type:ChannelType.GuildText,topic:config.topic}); if(type==='tickets')await sendTicketPanel(ch); if(type==='shop'&&db.articles.length>0)await ch.send({embeds:[buildShopEmbed()]}); return interaction.editReply({content:`✅ Salon **${config.name}** créé : <#${ch.id}>`});}catch(e){return interaction.editReply({content:`❌ ${e.message}`});} }

  if (cmd==='setup-serveur') { await interaction.deferReply({ephemeral:true}); const created=[]; for(const s of ['rules','welcome','shop','tickets','annonces','general','classement','vocaux']){try{const cfg=SALON_CONFIGS[s];const ch=await interaction.guild.channels.create({name:cfg.name,type:ChannelType.GuildText,topic:cfg.topic});if(s==='tickets')await sendTicketPanel(ch);created.push(`<#${ch.id}>`);}catch(e){}}return interaction.editReply({embeds:[new EmbedBuilder().setTitle('🚀 Serveur configuré !').setColor(C('#10d982')).setDescription(`**${created.length} salons créés :**\n${created.join('\n')}\n\n✅ Règles → \`/generer-regles\`\n✅ Bienvenue → \`/config-bienvenue\`\n✅ Articles → \`/ajouter-article\``).setTimestamp()]}); }

  if (cmd==='config-shop') { const cfg=db.shopConfig; const n=interaction.options.getString('nom'),col=interaction.options.getString('couleur'),ft=interaction.options.getString('footer'); if(n)cfg.name=n;if(col)cfg.color=col;if(ft)cfg.footer=ft; return interaction.reply({embeds:[OK('Config boutique sauvegardée !',`Nom : **${cfg.name}**`)]}); }

  if (cmd==='config-bienvenue') { const msg=interaction.options.getString('message'),color=interaction.options.getString('couleur'); if(msg)db.welcomeConfig.message=msg; if(color)db.welcomeConfig.color=color; return interaction.reply({embeds:[new EmbedBuilder().setTitle('⚙️ Config bienvenue mise à jour').setColor(C('#10d982')).setDescription(`**Message :**\n${db.welcomeConfig.message}\n\n**Variables :** {user}, {server}, {count}, {username}`).setTimestamp()]}); }

  if (cmd==='regles') { const rules=[{e:'🤝',t:'Respect',d:'Traitez chaque membre avec respect.'},{e:'🚫',t:'Anti-toxicité',d:'Aucune insulte ni comportement toxique.'},{e:'📢',t:'Anti-spam',d:'Pas de flood ni de répétitions.'},{e:'🔒',t:'Vie privée',d:'Ne partagez pas de données perso.'},{e:'🎫',t:'Tickets',d:'Problème → /ticket pour contacter le staff.'},{e:'⚖️',t:'Modération',d:'Les décisions du staff sont finales.'}]; const emb=new EmbedBuilder().setTitle('📜 Règles du Serveur').setColor(C('#e74c3c')).setTimestamp().setFooter({text:'Non-respect = sanctions'}); rules.forEach((r,i)=>emb.addFields({name:`${r.e} ${i+1}. ${r.t}`,value:r.d})); return interaction.reply({embeds:[emb]}); }

  // ══ CANDIDATURES ══
  if (cmd==='postuler') { const modal=new ModalBuilder().setCustomId('app_modal').setTitle('📝 Candidature Staff'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q1').setLabel('Pourquoi rejoindre l\'équipe ?').setStyle(TextInputStyle.Paragraph).setMinLength(30).setMaxLength(500).setRequired(true)),new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q2').setLabel('Ton expérience ?').setStyle(TextInputStyle.Paragraph).setMinLength(20).setMaxLength(300).setRequired(true)),new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q3').setLabel('Disponibilité par semaine ?').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(modal); }
  if (cmd==='candidatures') { if(!db.applications.length)return interaction.reply({embeds:[INF('Candidatures','Aucune.')],ephemeral:true}); return interaction.reply({embeds:[new EmbedBuilder().setTitle(`📋 Candidatures (${db.applications.length})`).setColor(C('#f0b429')).setDescription(db.applications.map((a,i)=>`**${i+1}.** ${a.username} — ${a.status} — ${a.date}`).join('\n')).setTimestamp()],ephemeral:true}); }

  if (cmd==='rapport') { await interaction.deferReply(); const g=interaction.guild;await g.fetch(); const topEco=Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,3).map(([id,d],i)=>`${['🥇','🥈','🥉'][i]} <@${id}> — ${d.points} pts`).join('\n')||'Aucun'; const topVoice=Object.entries(db.voiceStats).sort(([,a],[,b])=>b.totalMinutes-a.totalMinutes).slice(0,3).map(([id,vs],i)=>{const h=Math.floor(vs.totalMinutes/60),m=vs.totalMinutes%60;return`${['🥇','🥈','🥉'][i]} <@${id}> — ${h}h${m}m`;}).join('\n')||'Aucun'; return interaction.editReply({embeds:[new EmbedBuilder().setTitle(`📑 Rapport — ${g.name}`).setColor(C('#f0b429')).addFields({name:'👥 Membres',value:`${g.memberCount}`,inline:true},{name:'📦 Articles',value:`${db.articles.length}`,inline:true},{name:'🎫 Tickets',value:`${Object.keys(db.ticketMap).length}`,inline:true},{name:'⚠️ Warns total',value:`${Object.values(db.warns).reduce((s,w)=>s+w.length,0)}`,inline:true},{name:'🎤 En vocal',value:`${Object.keys(db.voiceActive).length}`,inline:true},{name:'⚡ Cmds custom',value:`${Object.keys(db.customCmds).length}`,inline:true},{name:'🏆 Top Points',value:topEco,inline:false},{name:'🎤 Top Vocal',value:topVoice,inline:false}).setTimestamp().setFooter({text:`Généré le ${new Date().toLocaleString('fr-FR')}`})]});}
});

// ═══════════════════════════════════════════════════════════════════
// ─── API REST PANEL ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());

function authPanel(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) { res.setHeader('WWW-Authenticate','Basic realm="NexusBot Panel"'); return res.status(401).json({ error:'Non autorisé' }); }
  const [,encoded] = auth.split(' ');
  const pass = Buffer.from(encoded,'base64').toString().split(':').slice(1).join(':');
  if (pass !== PANEL_PASSWORD) return res.status(403).json({ error:'Mot de passe incorrect' });
  next();
}

app.use('/admin', authPanel, express.static(path.join(__dirname,'public')));

// Status
app.get('/api/status', authPanel, (req, res) => {
  const guild = client.guilds.cache.get(GUILD_ID);
  res.json({ online:!!client.user, tag:client.user?.tag||'—', ping:client.ws.ping, uptime:client.uptime, guildName:guild?.name||'—', memberCount:guild?.memberCount||0, customCmds:Object.keys(db.customCmds).length, articles:db.articles.length, tickets:Object.keys(db.ticketMap).length, voiceActive:Object.keys(db.voiceActive).length });
});

// Stats
app.get('/api/stats', authPanel, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    await guild.members.fetch();
    const online = guild.members.cache.filter(m=>!m.user.bot&&m.presence?.status&&m.presence.status!=='offline').size;
    const bots = guild.members.cache.filter(m=>m.user.bot).map(b=>({username:b.user.username,id:b.id}));
    const totalWarns = Object.values(db.warns).reduce((s,w)=>s+w.length,0);
    res.json({ members:guild.memberCount, online, channels:guild.channels.cache.size, roles:guild.roles.cache.size, articles:db.articles.length, customCmds:Object.keys(db.customCmds).length, tickets:Object.keys(db.ticketMap).length, giveaways:Object.values(db.giveaways).filter(g=>!g.ended).length, economy:Object.keys(db.economy).length, totalWarns, voiceActive:Object.keys(db.voiceActive).length, bots, topPoints:Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,5).map(([id,d])=>({id,points:d.points,level:d.level})) });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/logs', authPanel, (req, res) => res.json(db.panelLogs.slice(0,100)));

// Membres
app.get('/api/member/:userId', authPanel, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(req.params.userId);
    const u = getUser(member.id);
    const vs = db.voiceStats[member.id]||{totalMinutes:0,sessions:0};
    res.json({ id:member.id, username:member.user.username, avatar:member.user.displayAvatarURL({dynamic:true}), roles:member.roles.cache.filter(r=>r.id!==guild.id).map(r=>r.name), joinedAt:member.joinedAt?.toLocaleDateString('fr-FR'), points:u.points, level:u.level, warns:db.warns[member.id]||[], voiceMinutes:vs.totalMinutes, rep:getRep(member.id).total });
  } catch(e) { res.status(404).json({ error:'Membre introuvable' }); }
});

// Bans
app.get('/api/bans', authPanel, async (req, res) => {
  try { const guild=client.guilds.cache.get(GUILD_ID); const bans=await guild.bans.fetch(); res.json(bans.map(b=>({user:{id:b.user.id,username:b.user.username},reason:b.reason}))); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

// Commandes custom
app.get('/api/cmds', authPanel, (req, res) => res.json(Object.entries(db.customCmds).map(([name,data])=>({name,...data}))));
app.post('/api/cmds', authPanel, (req, res) => {
  const { name, desc, reponse, code, type, color, ephemeral } = req.body;
  if (!name) return res.status(400).json({ error:'Nom requis' });
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'');
  if (!safeName) return res.status(400).json({ error:'Nom invalide' });
  db.customCmds[safeName] = { desc:desc||'', reponse:reponse||'', code:code||'', type:type||'text', color:color||'#f0b429', ephemeral:!!ephemeral, updatedAt:new Date().toLocaleString('fr-FR') };
  log(`⚡ Commande custom: /${safeName}`);
  res.json({ ok:true, name:safeName, cmd:db.customCmds[safeName] });
});
app.delete('/api/cmds/:name', authPanel, (req, res) => {
  const name = req.params.name.toLowerCase();
  if (!db.customCmds[name]) return res.status(404).json({ error:'Introuvable' });
  delete db.customCmds[name];
  log(`🗑️ Commande supprimée: /${name}`);
  res.json({ ok:true, deleted:name });
});

// Articles
app.get('/api/articles', authPanel, (req, res) => res.json(db.articles));
app.post('/api/articles', authPanel, (req, res) => {
  const { name, price, link, description, emoji, stock, image } = req.body;
  if (!name||!price) return res.status(400).json({ error:'Nom et prix requis' });
  const article = { id:Date.now(), name, price, link:link||'', description:description||'', emoji:emoji||'🛒', stock:stock??-1, image:image||'', visible:true, createdAt:new Date().toLocaleString('fr-FR') };
  db.articles.push(article);
  log(`🛒 Article: ${name}`);
  res.json({ ok:true, article });
});
app.delete('/api/articles/:id', authPanel, (req, res) => {
  const id=parseInt(req.params.id), idx=db.articles.findIndex(a=>a.id===id);
  if (idx<0) return res.status(404).json({ error:'Introuvable' });
  const deleted=db.articles.splice(idx,1)[0];
  log(`🗑️ Article supprimé: ${deleted.name}`);
  res.json({ ok:true, deleted });
});
app.put('/api/articles/:id', authPanel, (req, res) => {
  const id=parseInt(req.params.id), art=db.articles.find(a=>a.id===id);
  if (!art) return res.status(404).json({ error:'Introuvable' });
  Object.assign(art, req.body, { id });
  res.json({ ok:true, article:art });
});

// Shop config
app.get('/api/shop-config', authPanel, (req, res) => res.json(db.shopConfig));
app.post('/api/shop-config', authPanel, (req, res) => {
  const { name, color, footer, description, banner } = req.body;
  if (name) db.shopConfig.name=name; if (color) db.shopConfig.color=color;
  if (footer) db.shopConfig.footer=footer; if (description) db.shopConfig.description=description;
  if (banner) db.shopConfig.banner=banner;
  res.json({ ok:true, config:db.shopConfig });
});

// Annonce
app.post('/api/announce', authPanel, async (req, res) => {
  const { channelId, title, message, color, mention } = req.body;
  if (!channelId||!message) return res.status(400).json({ error:'channelId et message requis' });
  try {
    const guild=client.guilds.cache.get(GUILD_ID), ch=guild?.channels.cache.get(channelId);
    if (!ch) return res.status(404).json({ error:'Channel introuvable' });
    const emb=new EmbedBuilder().setTitle(title||'📢 Annonce').setDescription(message).setColor(C(color||'#5865F2')).setTimestamp().setFooter({text:'Panel NexusBot'});
    await ch.send({ content:mention||undefined, embeds:[emb] });
    log(`📢 Annonce → #${ch.name}`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// Config modération
app.post('/api/mod-config', authPanel, (req, res) => { Object.assign(db.modConfig, req.body); log('⚙️ Config mod mise à jour'); res.json({ ok:true }); });

// Actions modération
app.post('/api/mod/warn', authPanel, async (req, res) => {
  const { userId, reason } = req.body;
  if (!userId||!reason) return res.status(400).json({ error:'userId et reason requis' });
  try {
    const guild=client.guilds.cache.get(GUILD_ID), member=await guild.members.fetch(userId);
    if (!db.warns[userId]) db.warns[userId]=[];
    db.warns[userId].push({ reason, modId:'panel', date:new Date().toLocaleString('fr-FR') });
    const total=db.warns[userId].length;
    if (db.modConfig.dm) member.send({ embeds:[new EmbedBuilder().setTitle('⚠️ Avertissement').setDescription(`**Serveur :** ${guild.name}\n**Raison :** ${reason}\n**Total :** ${total}`).setColor(C('#f0b429')).setTimestamp()] }).catch(()=>{});
    if (CH_LOGS) { const ch=guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('⚠️ Warn — Panel').setColor(C('#f0b429')).addFields({name:'Membre',value:`<@${userId}>`},{name:'Raison',value:reason},{name:'Total',value:`${total}`}).setTimestamp()] }); }
    if (db.modConfig.autosanction&&total>=3) member.timeout(10*60000,'3 warns').catch(()=>{});
    log(`⚠️ Warn panel: ${member.user.username}`);
    res.json({ ok:true, total });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/mute', authPanel, async (req, res) => {
  const { userId, minutes, reason } = req.body;
  if (!userId) return res.status(400).json({ error:'userId requis' });
  try {
    const guild=client.guilds.cache.get(GUILD_ID), member=await guild.members.fetch(userId);
    await member.timeout((minutes||10)*60000, reason||'Panel admin');
    if (db.modConfig.dm) member.send({ embeds:[new EmbedBuilder().setTitle('🔇 Sourdine').setDescription(`**Durée :** ${minutes||10}min\n**Raison :** ${reason||'Panel'}`).setColor(C('#4d8fff')).setTimestamp()] }).catch(()=>{});
    if (CH_LOGS) { const ch=guild.channels.cache.get(CH_LOGS); if(ch) ch.send({ embeds:[new EmbedBuilder().setTitle('🔇 Mute — Panel').setColor(C('#4d8fff')).addFields({name:'Membre',value:`<@${userId}>`},{name:'Durée',value:`${minutes||10}min`},{name:'Raison',value:reason||'Panel'}).setTimestamp()] }); }
    log(`🔇 Mute panel: ${member.user.username} ${minutes}min`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/kick', authPanel, async (req, res) => {
  const { userId, reason } = req.body;
  if (!userId) return res.status(400).json({ error:'userId requis' });
  try {
    const guild=client.guilds.cache.get(GUILD_ID), member=await guild.members.fetch(userId);
    if (!member.kickable) return res.status(403).json({ error:'Impossible d\'expulser' });
    if (db.modConfig.dm) member.send({ embeds:[ERR(`Expulsé de **${guild.name}**. Raison : ${reason||'Panel'}`)] }).catch(()=>{});
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
    const guild=client.guilds.cache.get(GUILD_ID), member=await guild.members.fetch(userId).catch(()=>null);
    if (member) {
      if (!member.bannable) return res.status(403).json({ error:'Impossible de bannir' });
      if (db.modConfig.dm) member.send({ embeds:[ERR(`Banni de **${guild.name}**. Raison : ${reason||'Panel'}`)] }).catch(()=>{});
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
  try { const guild=client.guilds.cache.get(GUILD_ID); await guild.members.unban(userId); log(`🔓 Unban: ${userId}`); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error:e.message }); }
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
    const guild=client.guilds.cache.get(GUILD_ID), ch=guild.channels.cache.get(channelId);
    if (!ch) return res.status(404).json({ error:'Salon introuvable' });
    const deleted=await ch.bulkDelete(Math.min(amount||10,100),true);
    log(`🗑️ Clear: ${deleted.size} messages dans #${ch.name}`);
    res.json({ ok:true, deleted:deleted.size });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/lock', authPanel, async (req, res) => {
  const { channelId, lock } = req.body;
  if (!channelId) return res.status(400).json({ error:'channelId requis' });
  try {
    const guild=client.guilds.cache.get(GUILD_ID), ch=guild.channels.cache.get(channelId);
    if (!ch) return res.status(404).json({ error:'Salon introuvable' });
    await ch.permissionOverwrites.edit(guild.id, { SendMessages:lock?false:null });
    log(`${lock?'🔒':'🔓'} ${lock?'Lock':'Unlock'}: #${ch.name}`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/slowmode', authPanel, async (req, res) => {
  const { channelId, seconds } = req.body;
  if (!channelId) return res.status(400).json({ error:'channelId requis' });
  try {
    const guild=client.guilds.cache.get(GUILD_ID), ch=guild.channels.cache.get(channelId);
    if (!ch) return res.status(404).json({ error:'Salon introuvable' });
    await ch.setRateLimitPerUser(seconds||0);
    log(`🐌 Slowmode: #${ch.name} ${seconds}s`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/mod/lockdown', authPanel, async (req, res) => {
  const { message } = req.body;
  try {
    const guild=client.guilds.cache.get(GUILD_ID);
    const channels=guild.channels.cache.filter(c=>c.type===ChannelType.GuildText);
    let count=0;
    for (const [,ch] of channels) {
      try { await ch.permissionOverwrites.edit(guild.id,{SendMessages:false}); if(message)await ch.send({embeds:[new EmbedBuilder().setTitle('🚨 LOCKDOWN').setDescription(message).setColor(C('#ff4d4d')).setTimestamp()]}); count++; } catch(e){}
    }
    log(`🚨 LOCKDOWN: ${count} salons verrouillés`);
    res.json({ ok:true, locked:count });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// Stats vocaux
app.get('/api/voice-stats', authPanel, (req, res) => {
  const stats=Object.entries(db.voiceStats).sort(([,a],[,b])=>b.totalMinutes-a.totalMinutes).slice(0,20).map(([id,vs])=>({id,...vs,isActive:!!db.voiceActive[id]}));
  res.json({ stats, active:db.voiceActive });
});

app.get('/api/voice-live', authPanel, async (req, res) => {
  try {
    const guild=client.guilds.cache.get(GUILD_ID);
    const result=[];
    guild.channels.cache.filter(c=>c.type===ChannelType.GuildVoice).forEach(vc=>{
      const members=vc.members.filter(m=>!m.user.bot);
      if(!members.size)return;
      result.push({ channelId:vc.id, channelName:vc.name, members:members.map(m=>({id:m.id,username:m.user.username,muted:m.voice.selfMute,deafened:m.voice.selfDeaf})) });
    });
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// Tickets
app.get('/api/tickets', authPanel, (req, res) => {
  res.json({ categories:db.ticketCategories, active:db.ticketMap, count:db.ticketCount });
});

app.post('/api/ticket-category', authPanel, (req, res) => {
  const { id, label, desc, color } = req.body;
  if (!id||!label) return res.status(400).json({ error:'id et label requis' });
  const safeid = id.toLowerCase().replace(/[^a-z0-9-]/g,'-');
  const existing = db.ticketCategories.findIndex(c=>c.id===safeid);
  if (existing>=0) db.ticketCategories[existing]={id:safeid,label,desc:desc||'',color:color||'#5865F2'};
  else db.ticketCategories.push({id:safeid,label,desc:desc||'',color:color||'#5865F2'});
  log(`🎫 Catégorie ticket: ${label}`);
  res.json({ ok:true, categories:db.ticketCategories });
});

// Exec validation
app.post('/api/exec', authPanel, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error:'Code requis' });
  const errors=[],warnings=[];
  if ((code.match(/\{/g)||[]).length!==(code.match(/\}/g)||[]).length) errors.push('Accolades non balancées');
  if ((code.match(/\(/g)||[]).length!==(code.match(/\)/g)||[]).length) errors.push('Parenthèses non balancées');
  if (!code.includes('interaction.reply')&&!code.includes('interaction.editReply')) warnings.push('Aucun interaction.reply() détecté');
  if (code.includes('process.env')) errors.push('process.env interdit');
  if (code.includes('require(')) errors.push('require() interdit');
  res.json({ ok:errors.length===0, errors, warnings, lines:code.split('\n').length, chars:code.length });
});

// Base
app.get('/', (req, res) => res.json({ status:'ok', bot:client.user?.tag||'connecting...', panel:'/admin/nexusbot-panel.html', version:'ULTIMATE' }));

app.post('/sellhub', async (req, res) => {
  res.status(200).json({ ok:true });
  const { event, data } = req.body||{};
  if ((event==='order.created'||event==='order.completed')&&CH_SALES) {
    const guild=client.guilds.cache.get(GUILD_ID), ch=guild?.channels.cache.get(CH_SALES);
    if (ch) { const o=data||{}; ch.send({embeds:[new EmbedBuilder().setTitle('💰 Nouvelle Vente !').setColor(C('#10d982')).addFields({name:'📦 Produit',value:o.product?.name||'—',inline:true},{name:'💵 Montant',value:o.amount?parseFloat(o.amount).toFixed(2)+'€':'—',inline:true}).setTimestamp().setFooter({text:'Sellhub'})]}); }
    if (data?.discordId&&ROLE_VIP) { const g=client.guilds.cache.get(GUILD_ID); const m=await g?.members.fetch(data.discordId).catch(()=>null); if(m){const r=g.roles.cache.get(ROLE_VIP);if(r)m.roles.add(r).catch(()=>{});addPts(data.discordId,50);} }
  }
});

app.listen(PORT, () => log(`🌐 Serveur sur le port ${PORT} | Panel: /admin/nexusbot-panel.html`));
client.login(TOKEN).catch(e => { console.error('❌', e.message); process.exit(1); });
