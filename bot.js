// ═══════════════════════════════════════════════════════════════════
//  NexusBot PREMIUM — 100% Gratuit, Zéro IA externe
//
//  ✅ /ajouter-article  — Ajoute un article à la boutique interne
//  ✅ /supprimer-article — Supprime un article
//  ✅ /liste-articles   — Liste tous les articles
//  ✅ /publier-shop     — Publie la boutique complète en embed
//  ✅ /publier-article  — Publie UN article en embed
//  ✅ /generer-regles   — Génère 10 règles automatiquement (sans IA)
//  ✅ /generer-bienvenue — Génère un message de bienvenue
//  ✅ /setup-salon      — Crée un salon pré-configuré avec embed
//  ✅ /setup-serveur    — Config complète du serveur en 1 commande
//  ✅ /reaction-role    — Crée un message de reaction roles
//  ✅ /message-perso    — Message embed 100% personnalisable
//  ✅ /niveaux          — Système de niveaux XP
//  ✅ /rapport          — Rapport complet du serveur (PDF-like)
//  ✅ /alerte-stock     — Alerte quand un produit est dispo
//  ✅ Giveaway, sondage, ticket, économie, modération complète
//
//  Variables Railway : DISCORD_TOKEN, CLIENT_ID, GUILD_ID
//  Optionnel : SELLHUB_KEY, STORE_URL, CH_WELCOME, CH_BYE,
//              CH_SALES, CH_LOGS, CH_TICKETS,
//              ROLE_MEMBER, ROLE_VIP, ROLE_SUPPORT
// ═══════════════════════════════════════════════════════════════════

const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, ChannelType, REST, Routes,
  SlashCommandBuilder, Events
} = require('discord.js');
const express = require('express');

// ─── CONFIG ─────────────────────────────────────────────────
const TOKEN      = process.env.DISCORD_TOKEN;
const CLIENT_ID  = process.env.CLIENT_ID;
const GUILD_ID   = process.env.GUILD_ID;
const SH_KEY     = process.env.SELLHUB_KEY  || '';
const STORE_URL  = process.env.STORE_URL    || '';
const PORT       = process.env.PORT         || 3000;

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
  // Articles boutique interne
  articles: [],
  // Économie & niveaux
  economy: {},
  // Modération
  warns: {},
  // Tickets
  ticketMap: {},
  // Giveaways
  giveaways: {},
  // Sondages
  polls: {},
  // Commandes personnalisées
  customCmds: {},
  // Candidatures
  applications: [],
  // Boutique de rôles
  roleShop: [],
  // Reaction roles
  reactionRoles: {},
  // Alertes stock
  stockAlerts: {},
  // Config boutique
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
  // Config boutique paiements & contact
  boutiqueConfig: {
    lien:          process.env.STORE_URL       || '',
    nom:           process.env.STORE_NAME      || 'NexusStore',
    emailContact:  process.env.EMAIL_CONTACT   || '',
    emailPaiement: process.env.EMAIL_PAIEMENT  || '',
    stripeLien:    process.env.STRIPE_LIEN     || '',
    sumupLien:     process.env.SUMUP_LIEN      || '',
  },
  // Produits Sellhub cache
  sellhubProducts: [],
};

// ─── TEMPLATES INTÉGRÉS ─────────────────────────────────────

// 10 règles pré-définies par type de serveur
const RULES_TEMPLATES = {
  vente: [
    { e: '🤝', t: 'Respect mutuel', d: 'Traitez chaque membre avec respect. Aucune insulte, moquerie ou comportement toxique ne sera toléré, qu\'il vienne d\'acheteurs ou de vendeurs.' },
    { e: '💰', t: 'Transactions honnêtes', d: 'Toute vente doit être transparente. Les descriptions de produits doivent être exactes et complètes. Zéro arnaque, zéro fausse pub.' },
    { e: '🚫', t: 'Zéro escroquerie', d: 'Toute tentative de fraude, phishing ou vol entraîne un bannissement définitif et immédiat. Pas de seconde chance.' },
    { e: '📦', t: 'Livraison & Support', d: 'Tout vendeur s\'engage à livrer dans les délais annoncés. En cas de problème, ouvrez un ticket. Ne contactez pas le staff en DM.' },
    { e: '🔒', t: 'Confidentialité', d: 'Ne partagez jamais vos données personnelles (adresse, CB, mot de passe) dans les salons publics. Protégez votre vie privée.' },
    { e: '📢', t: 'Publicité interdite', d: 'Aucune promotion externe, lien non autorisé ou recrutement sans permission écrite du staff.' },
    { e: '🎫', t: 'Utilisation des tickets', d: 'Pour tout litige, problème de commande ou question, utilisez la commande /ticket. Les disputes en public sont interdites.' },
    { e: '🌍', t: 'Langue française', d: 'Les salons généraux sont en français. Merci de respecter cette règle pour une bonne compréhension de tous.' },
    { e: '⚖️', t: 'Décisions du staff', d: 'Les décisions du staff sont définitives. Vous pouvez contester via ticket de manière respectueuse, pas en public.' },
    { e: '🔞', t: 'Âge minimum', d: 'L\'accès à certains produits et salons est réservé aux membres majeurs. Respectez les restrictions d\'âge indiquées.' },
  ],
  gaming: [
    { e: '🎮', t: 'Fair-play obligatoire', d: 'Le triche, l\'exploitation de bugs et le comportement toxique en jeu sont interdits. Respectez vos adversaires.' },
    { e: '🤝', t: 'Respect & bienveillance', d: 'Aucune insulte, toxicité ou harassment. Ce serveur est un espace safe pour tous les gamers, peu importe le niveau.' },
    { e: '📢', t: 'Pas de spam', d: 'Pas de flood, de messages répétés ou de mentions abusives. Un message suffit.' },
    { e: '🚫', t: 'Contenu approprié', d: 'Pas de contenu NSFW, violent ou choquant hors des salons dédiés (18+).' },
    { e: '🎤', t: 'Vocaux', d: 'En vocal : micro propre recommandé, pas de bruit excessif, respectez quand quelqu\'un parle.' },
    { e: '🏆', t: 'Compétitions', d: 'Lors des tournois et events : suivez les règles spécifiques de chaque compétition. Les décisions des arbitres sont finales.' },
    { e: '📱', t: 'Self-promo', d: 'Partagez vos streams/vidéos uniquement dans le salon dédié. Pas de DM non sollicités.' },
    { e: '🔒', t: 'Comptes personnels', d: 'Ne partagez jamais vos identifiants de jeux. Le staff ne vous demandera JAMAIS votre mot de passe.' },
    { e: '⚖️', t: 'Sanctions', d: 'Warn → Mute → Kick → Ban. Les sanctions sont progressives sauf pour les infractions graves (arnaque, NSFW non consenti).' },
    { e: '🎫', t: 'Support', d: 'Pour tout problème technique ou litige, ouvrez un ticket avec /ticket.' },
  ],
  communaute: [
    { e: '💙', t: 'Bienveillance', d: 'Cette communauté est un espace positif. Soutenez-vous mutuellement, encouragez les autres et restez respectueux en toutes circonstances.' },
    { e: '🗣️', t: 'Communication saine', d: 'Exprimez-vous clairement et respectueusement. Les désaccords sont normaux, les conflits personnels non.' },
    { e: '🚫', t: 'Discrimination zéro', d: 'Aucune discrimination basée sur le genre, l\'origine, la religion, l\'orientation sexuelle ou tout autre critère. Tolérance absolue.' },
    { e: '📵', t: 'Anti-spam', d: 'Un message à la fois. Pas de flood, répétitions ou mentions inutiles. Respectez le fil de conversation.' },
    { e: '🔞', t: 'Contenu adapté', d: 'Respectez les restrictions d\'âge des salons. Le contenu pour adultes n\'est autorisé que dans les salons dédiés.' },
    { e: '🔒', t: 'Vie privée', d: 'Ne partagez pas d\'informations personnelles sur vous ou les autres. Ce qui est dit ici reste ici.' },
    { e: '📢', t: 'Publicité', d: 'Toute promotion doit être approuvée par un modérateur. Le spam publicitaire entraîne un ban immédiat.' },
    { e: '🎫', t: 'Signalements', d: 'Si vous observez une infraction, utilisez /ticket plutôt que de répondre publiquement. Ne nourrissez pas le troll.' },
    { e: '🏅', t: 'Rôles & grades', d: 'Les rôles sont gagnés par l\'activité et le comportement. Ne les réclamez pas en public.' },
    { e: '⚖️', t: 'Modération', d: 'Les modérateurs ont le dernier mot. En cas de désaccord, contactez un admin via ticket de manière courtoise.' },
  ],
};

// Templates de messages de bienvenue
const WELCOME_TEMPLATES = [
  '👋 Bienvenue **{user}** sur **{server}** !\n\nNous sommes maintenant **{count}** membres 🎉\n\n📜 Lis les règles avec `/regles`\n🛒 Découvre notre boutique avec `/shop`\n🎫 Besoin d\'aide ? Utilise `/ticket`\n💰 Commence à gagner des points avec `/daily` !',
  '🌟 **{user}** vient de rejoindre **{server}** !\n\nBienvenue dans notre communauté ! Tu es le **#{count}** membre 🚀\n\n➜ `/regles` pour les règles du serveur\n➜ `/shop` pour voir nos produits\n➜ `/aide` pour toutes les commandes',
  '⚡ Hey **{user}** ! Bienvenue sur **{server}** !\n\nOn est maintenant **{count}** — merci de nous rejoindre ! 🔥\n\n🛒 Notre boutique t\'attend → `/shop`\n🎁 Réclame tes points gratuits → `/daily`\n🎫 Un problème ? → `/ticket`',
  '🎊 **{server}** souhaite la bienvenue à **{user}** !\n\nMembre **#{count}** dans la place ! 💎\n\nPrends 2 minutes pour lire `/regles` et explore notre `/shop` !\nL\'équipe est disponible 24/7 via `/ticket`.',
];

// Templates descriptions produits
const DESC_TEMPLATES = {
  digital: [
    '🔑 **Accès lifetime** inclus\n✅ Livraison instantanée après paiement\n🔄 Mises à jour gratuites à vie\n💬 Support dédié inclus\n🔒 Clé personnelle et non-partagée',
    '⚡ **Livraison en moins de 5 minutes**\n💎 Qualité premium garantie\n✅ Produit vérifié et testé\n🔄 Remplacement si problème\n📞 Support réactif 7j/7',
  ],
  service: [
    '🛠️ **Service professionnel** clé en main\n⏱️ Délai : annoncé à l\'achat\n✅ Satisfaction garantie ou remboursé\n💬 Communication via ticket Discord\n⭐ +100 clients satisfaits',
    '👑 **Prestation premium** sur-mesure\n🎯 Résultat garanti ou reprise gratuite\n📋 Devis détaillé avant démarrage\n🔒 Paiement sécurisé\n💼 Expérience professionnelle prouvée',
  ],
};

// ─── HELPERS ────────────────────────────────────────────────
const C   = h  => parseInt((h || '#5865F2').replace('#', ''), 16);
const log = m  => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${m}`);

// Économie & niveaux
function getUser(id) {
  if (!db.economy[id]) db.economy[id] = { points: 0, xp: 0, level: 1, lastDaily: 0, lastMsg: 0, totalEarned: 0, messages: 0 };
  return db.economy[id];
}
function addXP(id, amount) {
  const u    = getUser(id);
  u.xp      += amount;
  u.messages++;
  const needed = u.level * 100;
  if (u.xp >= needed) { u.xp -= needed; u.level++; return true; } // level up
  return false;
}
function addPts(id, n) { const u = getUser(id); u.points += n; u.totalEarned += n; return u.points; }
function rank(id) { return Object.entries(db.economy).sort(([,a],[,b]) => b.points - a.points).findIndex(([i]) => i === id) + 1; }

// Embeds
const OK  = (t, d) => new EmbedBuilder().setTitle(`✅ ${t}`).setDescription(d).setColor(C('#10d982')).setTimestamp();
const ERR = d      => new EmbedBuilder().setTitle('❌ Erreur').setDescription(d).setColor(C('#ff4d4d')).setTimestamp();
const INF = (t, d) => new EmbedBuilder().setTitle(`ℹ️ ${t}`).setDescription(d).setColor(C('#4d8fff')).setTimestamp();

// Article embed
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
  if (a.deliveryTime) fields.push({ name: '⏱️ Livraison', value: a.deliveryTime, inline: true });
  if (showBuy && a.link) fields.push({ name: '🔗 Acheter', value: `[**→ Payer maintenant**](${a.link})`, inline: false });

  emb.addFields(fields);
  if (a.image) emb.setImage(a.image);
  if (a.thumb) emb.setThumbnail(a.thumb);

  return emb;
}

// Boutique embed complète
function buildShopEmbed() {
  const cfg  = db.shopConfig;
  const articles = db.articles.filter(a => a.visible !== false && (a.stock === undefined || a.stock !== 0));

  const emb = new EmbedBuilder()
    .setTitle(cfg.name || '🛒 Boutique')
    .setColor(C(cfg.color || '#f0b429'))
    .setTimestamp()
    .setFooter({ text: cfg.footer || 'Paiement sécurisé 🔒' });

  if (cfg.description) emb.setDescription(cfg.description);
  else if (cfg.features?.length) emb.setDescription(cfg.features.join('\n'));

  if (cfg.banner) emb.setImage(cfg.banner);
  if (cfg.thumb)  emb.setThumbnail(cfg.thumb);

  if (articles.length > 0) {
    articles.forEach(a => {
      const stock = a.stock === -1 ? '♾️' : a.stock === 0 ? '❌' : a.stock != null ? `✅ ${a.stock}` : '✅';
      const val   = `${stock} — **${a.price}**${a.link ? `\n[**→ Acheter**](${a.link})` : ''}`;
      emb.addFields({ name: `${a.emoji || '🛒'} ${a.name}`, value: val, inline: true });
    });
  }

  if (STORE_URL) emb.addFields({ name: '\u200b', value: `[🌐 **Voir toute la boutique**](${STORE_URL})`, inline: false });

  return emb;
}

// Ticket
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
    embeds: [new EmbedBuilder().setTitle(`🎫 Ticket #${num} — ${category}`).setDescription(`Bienvenue ${user} ! Décrivez votre demande ci-dessous.\nNotre équipe vous répond rapidement.`).setColor(C('#5865F2')).addFields({ name: '📋 Catégorie', value: category, inline: true },{ name: '⏱️ Temps de réponse', value: '< 24h', inline: true },{ name: '🆔 Ticket', value: `#${num}`, inline: true }).setTimestamp()],
    components: [row]
  });
  if (CH_LOGS) { const l = guild.channels.cache.get(CH_LOGS); if (l) l.send({ embeds: [new EmbedBuilder().setTitle('🎫 Nouveau Ticket').setColor(C('#f0b429')).addFields({ name: 'Utilisateur', value: `${user} (${user.id})` },{ name: 'Catégorie', value: category },{ name: 'Channel', value: `<#${channel.id}>` }).setTimestamp()] }); }
  addPts(user.id, 5);
  return { channel, num };
}

async function closeTicket(channel, closer) {
  const uid = Object.entries(db.ticketMap).find(([,cid]) => cid === channel.id)?.[0];
  if (uid) delete db.ticketMap[uid];
  await channel.send({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Fermé').setDescription(`Fermé par ${closer}. Suppression dans 5s.`).setColor(C('#ff4d4d')).setTimestamp()] });
  if (CH_LOGS) { const l = channel.guild.channels.cache.get(CH_LOGS); if (l) l.send({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Fermé').setColor(C('#ff4d4d')).addFields({ name: 'Channel', value: channel.name },{ name: 'Fermé par', value: `${closer}` }).setTimestamp()] }); }
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

// Giveaway
async function endGiveaway(msgId, guild) {
  const gw = db.giveaways[msgId];
  if (!gw || gw.ended) return;
  gw.ended = true;
  const ch      = guild.channels.cache.get(gw.channel);
  const entries = [...gw.entries];
  if (!ch) return;
  if (!entries.length) return ch.send({ embeds: [ERR(`Giveaway **${gw.prize}** terminé — aucun participant.`)] });
  const winner = entries[Math.floor(Math.random() * entries.length)];
  gw.winner = winner;
  addPts(winner, 100);
  ch.send({ content: `🎉 <@${winner}>`, embeds: [new EmbedBuilder().setTitle('🎉 Giveaway Terminé !').setColor(C('#10d982')).addFields({ name: '🏆 Prix', value: gw.prize, inline: true },{ name: '🎊 Gagnant', value: `<@${winner}>`, inline: true },{ name: '👥 Participants', value: `${entries.length}`, inline: true }).setTimestamp()] });
}

// ─── SLASH COMMANDS ─────────────────────────────────────────
const COMMANDS = [
  // GÉNÉRAL
  new SlashCommandBuilder().setName('ping').setDescription('🏓 Latence du bot'),
  new SlashCommandBuilder().setName('aide').setDescription('📋 Toutes les commandes'),
  new SlashCommandBuilder().setName('info').setDescription('ℹ️ Informations sur le serveur'),
  new SlashCommandBuilder().setName('profil').setDescription('👤 Voir un profil').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Avatar d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('stats').setDescription('📊 Statistiques détaillées du serveur'),
  new SlashCommandBuilder().setName('rapport').setDescription('📑 Rapport complet du serveur').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // BOUTIQUE INTERNE
  new SlashCommandBuilder().setName('ajouter-article').setDescription('🛒 Ajouter un article à la boutique').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom de l\'article').setRequired(true))
    .addStringOption(o=>o.setName('prix').setDescription('Prix (ex: 9.99€)').setRequired(true))
    .addStringOption(o=>o.setName('lien').setDescription('Lien de paiement (Sellhub, Stripe...)').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Description de l\'article'))
    .addStringOption(o=>o.setName('emoji').setDescription('Emoji (ex: 💎)'))
    .addStringOption(o=>o.setName('categorie').setDescription('Catégorie (ex: Digital, Service...)'))
    .addIntegerOption(o=>o.setName('stock').setDescription('Stock (-1 = illimité, 0 = rupture)'))
    .addStringOption(o=>o.setName('image').setDescription('URL image'))
    .addStringOption(o=>o.setName('livraison').setDescription('Délai de livraison (ex: Instantanée)')),
  new SlashCommandBuilder().setName('supprimer-article').setDescription('🗑️ Supprimer un article').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom de l\'article').setRequired(true)),
  new SlashCommandBuilder().setName('modifier-article').setDescription('✏️ Modifier un article').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom actuel').setRequired(true))
    .addStringOption(o=>o.setName('prix').setDescription('Nouveau prix'))
    .addIntegerOption(o=>o.setName('stock').setDescription('Nouveau stock'))
    .addStringOption(o=>o.setName('description').setDescription('Nouvelle description')),
  new SlashCommandBuilder().setName('liste-articles').setDescription('📋 Liste de tous les articles'),
  new SlashCommandBuilder().setName('shop').setDescription('🛒 Affiche la boutique'),
  new SlashCommandBuilder().setName('article').setDescription('🛒 Détails d\'un article').addStringOption(o=>o.setName('nom').setDescription('Nom de l\'article').setRequired(true)),
  new SlashCommandBuilder().setName('publier-shop').setDescription('📤 Publie la boutique en embed').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Channel cible'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone ou @here')),
  new SlashCommandBuilder().setName('publier-article').setDescription('📤 Publie un article en embed').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom de l\'article').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel cible'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone ou @here')),
  new SlashCommandBuilder().setName('config-shop').setDescription('⚙️ Configure la boutique').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom de la boutique'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex (ex: #f0b429)'))
    .addStringOption(o=>o.setName('banner').setDescription('URL bannière'))
    .addStringOption(o=>o.setName('footer').setDescription('Texte du footer')),

  // GÉNÉRATEURS (sans IA)
  new SlashCommandBuilder().setName('generer-regles').setDescription('📜 Génère des règles automatiquement').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('type').setDescription('Type de serveur').setRequired(true).addChoices({ name: '🛒 Vente/Commerce', value: 'vente' },{ name: '🎮 Gaming', value: 'gaming' },{ name: '💬 Communauté', value: 'communaute' }))
    .addChannelOption(o=>o.setName('channel').setDescription('Publier directement dans un channel')),
  new SlashCommandBuilder().setName('generer-bienvenue').setDescription('👋 Génère un message de bienvenue').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(o=>o.setName('style').setDescription('Style du message (1-4)').setMinValue(1).setMaxValue(4)),
  new SlashCommandBuilder().setName('generer-description').setDescription('📝 Génère une description de produit').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('type').setDescription('Type de produit').setRequired(true).addChoices({ name: '💾 Produit digital', value: 'digital' },{ name: '🛠️ Service', value: 'service' }))
    .addIntegerOption(o=>o.setName('variant').setDescription('Variante (1-2)').setMinValue(1).setMaxValue(2)),

  // SETUP
  new SlashCommandBuilder().setName('setup-salon').setDescription('⚙️ Crée un salon pré-configuré').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o=>o.setName('type').setDescription('Type de salon').setRequired(true).addChoices(
      { name: '🛒 Boutique', value: 'shop' },
      { name: '📜 Règles', value: 'rules' },
      { name: '👋 Bienvenue', value: 'welcome' },
      { name: '🎫 Tickets', value: 'tickets' },
      { name: '📢 Annonces', value: 'annonces' },
      { name: '💰 Ventes', value: 'ventes' },
      { name: '🏆 Classement', value: 'classement' },
      { name: '💬 Général', value: 'general' }
    )),
  new SlashCommandBuilder().setName('setup-serveur').setDescription('🚀 Configure le serveur complet en 1 commande').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o=>o.setName('type').setDescription('Type de serveur').setRequired(true).addChoices({ name: '🛒 Vente', value: 'vente' },{ name: '🎮 Gaming', value: 'gaming' },{ name: '💬 Communauté', value: 'communaute' })),

  // EMBEDS & MESSAGES
  new SlashCommandBuilder().setName('bouton').setDescription('🔘 Envoie un bouton lien cliquable').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('texte').setDescription('Texte sur le bouton').setRequired(true))
    .addStringOption(o=>o.setName('lien').setDescription('URL (https://...)').setRequired(true))
    .addStringOption(o=>o.setName('message').setDescription('Texte au-dessus du bouton'))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel cible')),
  new SlashCommandBuilder().setName('boutons').setDescription('🔘 Embed avec jusqu\'à 5 boutons liens').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre de l\'embed').setRequired(true))
    .addStringOption(o=>o.setName('btn1').setDescription('Bouton 1 : texte|lien (ex: 🛒 Boutique|https://...)').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Description de l\'embed'))
    .addStringOption(o=>o.setName('btn2').setDescription('Bouton 2 : texte|lien'))
    .addStringOption(o=>o.setName('btn3').setDescription('Bouton 3 : texte|lien'))
    .addStringOption(o=>o.setName('btn4').setDescription('Bouton 4 : texte|lien'))
    .addStringOption(o=>o.setName('btn5').setDescription('Bouton 5 : texte|lien'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex (ex: #f0b429)'))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel cible'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone ou @here')),
  new SlashCommandBuilder().setName('ma-boutique').setDescription('🛒 Publie la boutique complète avec tous les produits et paiements').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Channel cible'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone ou @here')),
  new SlashCommandBuilder().setName('contact').setDescription('📧 Affiche les informations de contact de la boutique'),
  new SlashCommandBuilder().setName('paiements').setDescription('💳 Affiche tous les moyens de paiement acceptés'),
  new SlashCommandBuilder().setName('config-boutique').setDescription('⚙️ Configure la boutique (lien, email, paiements)').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('lien').setDescription('Lien Sellhub (ex: https://nexusstore.sellhub.cx)'))
    .addStringOption(o=>o.setName('email_contact').setDescription('Email de contact'))
    .addStringOption(o=>o.setName('email_paiement').setDescription('Email pour paiement entre proches'))
    .addStringOption(o=>o.setName('stripe_lien').setDescription('Lien de paiement Stripe'))
    .addStringOption(o=>o.setName('sumup_lien').setDescription('Lien de paiement Sumup'))
    .addStringOption(o=>o.setName('nom').setDescription('Nom de la boutique')),
  new SlashCommandBuilder().setName('annonce').setDescription('📢 Annonce embed').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o=>o.setName('message').setDescription('Contenu').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel'))
    .addStringOption(o=>o.setName('mention').setDescription('@everyone / @here'))
    .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex'))
    .addStringOption(o=>o.setName('image').setDescription('URL image')),
  new SlashCommandBuilder().setName('message-perso').setDescription('💬 Envoie un message simple').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('contenu').setDescription('Contenu du message').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('epingler').setDescription('📌 Épingle un message').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),
  new SlashCommandBuilder().setName('regles').setDescription('📜 Affiche les règles'),

  // MODÉRATION
  new SlashCommandBuilder().setName('warn').setDescription('⚠️ Avertir un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)),
  new SlashCommandBuilder().setName('warns').setDescription('📋 Voir les avertissements').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
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
    .addStringOption(o=>o.setName('userid').setDescription('ID utilisateur').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('🔇 Sourdine temporaire').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Durée en minutes').setMinValue(1).setMaxValue(40320))
    .addStringOption(o=>o.setName('raison').setDescription('Raison')),
  new SlashCommandBuilder().setName('unmute').setDescription('🔊 Enlever sourdine').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('🗑️ Supprimer des messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName('nombre').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('lock').setDescription('🔒 Verrouiller le channel').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('🔓 Déverrouiller').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('slowmode').setDescription('🐌 Slow mode').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(o=>o.setName('secondes').setDescription('Secondes (0 = off)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  new SlashCommandBuilder().setName('sanctions').setDescription('📋 Historique des sanctions').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),

  // TICKETS
  new SlashCommandBuilder().setName('ticket').setDescription('🎫 Ouvrir un ticket'),
  new SlashCommandBuilder().setName('fermer').setDescription('🔒 Fermer le ticket actuel'),
  new SlashCommandBuilder().setName('add').setDescription('➕ Ajouter un membre au ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('retirer').setDescription('➖ Retirer un membre du ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('renommer-ticket').setDescription('✏️ Renommer le ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o=>o.setName('nom').setDescription('Nouveau nom').setRequired(true)),

  // ÉCONOMIE & NIVEAUX
  new SlashCommandBuilder().setName('points').setDescription('💰 Voir vos points').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('niveau').setDescription('⭐ Voir votre niveau XP').addUserOption(o=>o.setName('membre').setDescription('Membre')),
  new SlashCommandBuilder().setName('daily').setDescription('🎁 Récupérer vos points quotidiens'),
  new SlashCommandBuilder().setName('classement').setDescription('🏆 Top 10 des membres'),
  new SlashCommandBuilder().setName('classement-xp').setDescription('⭐ Top 10 XP'),
  new SlashCommandBuilder().setName('donner-points').setDescription('💸 Donner des points').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('shop-roles').setDescription('🛍️ Boutique de rôles'),
  new SlashCommandBuilder().setName('acheter-role').setDescription('🛍️ Acheter un rôle avec vos points')
    .addRoleOption(o=>o.setName('role').setDescription('Rôle à acheter').setRequired(true)),
  new SlashCommandBuilder().setName('ajouter-role-shop').setDescription('🛍️ Ajouter un rôle à la boutique').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true))
    .addIntegerOption(o=>o.setName('prix').setDescription('Prix en points').setRequired(true).setMinValue(1)),

  // GIVEAWAY
  new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Créer un giveaway').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('prix').setDescription('Prix').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel')),
  new SlashCommandBuilder().setName('giveaway-fin').setDescription('🏁 Terminer un giveaway').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),
  new SlashCommandBuilder().setName('giveaway-reroll').setDescription('🔄 Nouveau gagnant').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),

  // SONDAGES
  new SlashCommandBuilder().setName('sondage').setDescription('📊 Créer un sondage').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('question').setDescription('Question').setRequired(true))
    .addStringOption(o=>o.setName('options').setDescription('Options séparées par | ex: Oui|Non|Peut-être').setRequired(true)),
  new SlashCommandBuilder().setName('resultats').setDescription('📊 Résultats d\'un sondage')
    .addStringOption(o=>o.setName('messageid').setDescription('ID du message').setRequired(true)),

  // COMMANDES PERSO
  new SlashCommandBuilder().setName('cmd-ajouter').setDescription('➕ Créer une commande personnalisée').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom de la commande').setRequired(true))
    .addStringOption(o=>o.setName('reponse').setDescription('Réponse du bot').setRequired(true)),
  new SlashCommandBuilder().setName('cmd-supprimer').setDescription('➖ Supprimer une commande personnalisée').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)),
  new SlashCommandBuilder().setName('cmd-liste').setDescription('📋 Liste des commandes personnalisées'),
  new SlashCommandBuilder().setName('cmd').setDescription('▶️ Utiliser une commande personnalisée')
    .addStringOption(o=>o.setName('nom').setDescription('Nom de la commande').setRequired(true)),

  // RÔLES
  new SlashCommandBuilder().setName('donner-role').setDescription('🎭 Donner un rôle').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('retirer-role').setDescription('🎭 Retirer un rôle').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('reaction-role').setDescription('🎭 Créer un message de reaction roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('titre').setDescription('Titre du message').setRequired(true))
    .addStringOption(o=>o.setName('paires').setDescription('emoji:roleID séparés par | ex: ✅:111|⭐:222').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Channel')),

  // CANDIDATURES
  new SlashCommandBuilder().setName('postuler').setDescription('📝 Postuler pour rejoindre l\'équipe'),
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

// ─── REGISTER ───────────────────────────────────────────────
async function register() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: COMMANDS });
    log(`✅ ${COMMANDS.length} commandes enregistrées`);
  } catch (e) { log(`❌ ${e.message}`); }
}

// ─── READY ──────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  log(`✅ ${client.user.tag} connecté`);
  client.user.setActivity(`🛒 /shop | /aide | ${COMMANDS.length} commandes`, { type: 3 });
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
        client.guilds.cache.get(GUILD_ID)?.then?.(g => endGiveaway(id, g)) || (() => { const g = client.guilds.cache.get(GUILD_ID); if (g) endGiveaway(id, g); })();
      }
    });
  }, 10000);
});

// ─── EVENTS ─────────────────────────────────────────────────
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

  // !setup-tickets
  if (msg.content === '!setup-tickets' && msg.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('t_open_cmd').setLabel('📦 Commande').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('t_open_sup').setLabel('🔧 Support').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('t_open_q').setLabel('❓ Question').setStyle(ButtonStyle.Success)
    );
    msg.channel.send({ embeds: [new EmbedBuilder().setTitle('🎫 Centre de Support').setDescription('Choisissez la catégorie de votre ticket :').setColor(C('#5865F2')).addFields({ name: '📦 Commande', value: 'Problème avec un achat', inline: true },{ name: '🔧 Support', value: 'Aide technique', inline: true },{ name: '❓ Question', value: 'Renseignements', inline: true }).setTimestamp().setFooter({ text: 'NexusBot • Support 24/7' })], components: [row] });
    msg.delete().catch(() => {});
  }
});

// Réactions
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

  // ══ BOUTONS ══
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
      const txt  = [...msgs.values()].reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleString('fr-FR')}] ${m.author.username}: ${m.content || '[embed/fichier]'}`).join('\n');
      return interaction.editReply({ files: [{ attachment: Buffer.from(txt, 'utf-8'), name: `transcript-${interaction.channel.name}.txt` }] });
    }
    if (id === 'gw_join') {
      const gw = db.giveaways[interaction.message.id];
      if (!gw || gw.ended) return interaction.reply({ content: '❌ Giveaway terminé.', ephemeral: true });
      if (gw.entries.has(interaction.user.id)) { gw.entries.delete(interaction.user.id); return interaction.reply({ content: `😔 Retiré du giveaway. Participants : **${gw.entries.size}**`, ephemeral: true }); }
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

  // ══ MODALS ══
  if (interaction.isModalSubmit() && interaction.customId === 'app_modal') {
    const answers = ['app_q1','app_q2','app_q3'].map(q => interaction.fields.getTextInputValue(q));
    const app = { userId: interaction.user.id, username: interaction.user.username, answers, date: new Date().toLocaleString('fr-FR'), status: 'en attente' };
    db.applications.push(app);
    const idx = db.applications.length - 1;
    await interaction.reply({ embeds: [OK('Candidature envoyée !', 'Ta candidature a bien été reçue. Tu recevras une réponse en DM.')], ephemeral: true });
    if (CH_LOGS) {
      const ch = interaction.guild.channels.cache.get(CH_LOGS);
      if (ch) ch.send({
        embeds: [new EmbedBuilder().setTitle('📝 Nouvelle Candidature').setColor(C('#f0b429')).setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })).addFields({ name: '👤 Candidat', value: `${interaction.user} (${interaction.user.id})` },{ name: '❓ Motivation', value: answers[0] },{ name: '🎯 Expérience', value: answers[1] },{ name: '📅 Disponibilité', value: answers[2] }).setTimestamp()],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`app_ok_${idx}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`app_no_${idx}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger))]
      });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  // ══ /ping ══
  if (cmd === 'ping') {
    const l = Date.now() - interaction.createdTimestamp;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏓 Pong !').setColor(C('#10d982')).addFields({ name: '⚡ Latence', value: `\`${l}ms\``, inline: true },{ name: '💓 API', value: `\`${Math.round(client.ws.ping)}ms\``, inline: true },{ name: '⏱️ Uptime', value: `\`${Math.floor(client.uptime/3600000)}h ${Math.floor((client.uptime%3600000)/60000)}m\``, inline: true }).setTimestamp()] });
  }

  // ══ /aide ══
  if (cmd === 'aide') {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📋 NexusBot Premium — ${COMMANDS.length} commandes`).setColor(C('#f0b429')).addFields(
      { name: '🛒 Boutique', value: '`/ajouter-article` `/supprimer-article` `/modifier-article` `/liste-articles` `/shop` `/article` `/publier-shop` `/publier-article` `/config-shop`' },
      { name: '🤖 Générateurs', value: '`/generer-regles` `/generer-bienvenue` `/generer-description`' },
      { name: '⚙️ Setup', value: '`/setup-salon` `/setup-serveur`' },
      { name: '✨ Embeds', value: '`/embed` `/annonce` `/message-perso` `/epingler`' },
      { name: '🛡️ Modération', value: '`/warn` `/warns` `/clearwarns` `/sanctions` `/kick` `/ban` `/unban` `/mute` `/unmute` `/clear` `/lock` `/unlock` `/slowmode`' },
      { name: '🎫 Tickets', value: '`/ticket` `/fermer` `/add` `/retirer` `/renommer-ticket`' },
      { name: '💰 Économie', value: '`/points` `/niveau` `/daily` `/classement` `/classement-xp` `/donner-points` `/shop-roles` `/acheter-role` `/ajouter-role-shop`' },
      { name: '🎉 Giveaway', value: '`/giveaway` `/giveaway-fin` `/giveaway-reroll`' },
      { name: '📊 Sondages', value: '`/sondage` `/resultats`' },
      { name: '⚙️ Cmds perso', value: '`/cmd-ajouter` `/cmd-supprimer` `/cmd-liste` `/cmd`' },
      { name: '🎭 Rôles', value: '`/donner-role` `/retirer-role` `/reaction-role`' },
      { name: '🌐 Général', value: '`/ping` `/info` `/profil` `/avatar` `/stats` `/rapport` `/postuler` `/candidatures` `/regles`' },
    ).setFooter({ text: '100% gratuit • Zéro IA externe • Tout en interne' }).setTimestamp()] });
  }

  // ══ /info ══
  if (cmd === 'info') {
    const g = interaction.guild; await g.fetch();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏠 ${g.name}`).setThumbnail(g.iconURL({ dynamic: true })).setColor(C('#5865F2')).addFields({ name: '👥 Membres', value: `${g.memberCount}`, inline: true },{ name: '📅 Créé le', value: g.createdAt.toLocaleDateString('fr-FR'), inline: true },{ name: '🎭 Rôles', value: `${g.roles.cache.size}`, inline: true },{ name: '# Channels', value: `${g.channels.cache.size}`, inline: true },{ name: '🚀 Boosts', value: `${g.premiumSubscriptionCount||0} (Niv.${g.premiumTier})`, inline: true },{ name: '😀 Emojis', value: `${g.emojis.cache.size}`, inline: true }).setTimestamp()] });
  }

  // ══ /stats ══
  if (cmd === 'stats') {
    const g = interaction.guild;
    const humans = g.members.cache.filter(m => !m.user.bot).size;
    const bots   = g.members.cache.filter(m => m.user.bot).size;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📊 Stats — ${g.name}`).setColor(C('#f0b429')).addFields(
      { name: '👤 Humains',    value: `${humans}`, inline: true },
      { name: '🤖 Bots',       value: `${bots}`, inline: true },
      { name: '💬 Channels',   value: `${g.channels.cache.filter(c=>c.type===ChannelType.GuildText).size}`, inline: true },
      { name: '🔊 Vocaux',     value: `${g.channels.cache.filter(c=>c.type===ChannelType.GuildVoice).size}`, inline: true },
      { name: '📦 Articles',   value: `${db.articles.length}`, inline: true },
      { name: '🎫 Tickets',    value: `${Object.keys(db.ticketMap).length}`, inline: true },
      { name: '🎉 Giveaways',  value: `${Object.values(db.giveaways).filter(g=>!g.ended).length} actifs`, inline: true },
      { name: '💰 Joueurs éco',value: `${Object.keys(db.economy).length}`, inline: true },
      { name: '⚙️ Cmds perso', value: `${Object.keys(db.customCmds).length}`, inline: true },
    ).setTimestamp()] });
  }

  // ══ /rapport ══
  if (cmd === 'rapport') {
    await interaction.deferReply();
    const g = interaction.guild; await g.fetch();
    const topEco = Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,3).map(([id,d],i)=>`${['🥇','🥈','🥉'][i]} <@${id}> — ${d.points} pts`).join('\n') || 'Aucun';
    const topXP  = Object.entries(db.economy).sort(([,a],[,b])=>b.level-a.level).slice(0,3).map(([id,d],i)=>`${['🥇','🥈','🥉'][i]} <@${id}> — Niveau ${d.level}`).join('\n') || 'Aucun';
    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`📑 Rapport Complet — ${g.name}`).setColor(C('#f0b429')).addFields(
      { name: '👥 Membres', value: `${g.memberCount} total (${g.members.cache.filter(m=>!m.user.bot).size} humains)`, inline: false },
      { name: '📦 Boutique', value: `${db.articles.length} articles en ligne`, inline: true },
      { name: '🎫 Tickets', value: `${Object.keys(db.ticketMap).length} ouverts`, inline: true },
      { name: '🎉 Giveaways', value: `${Object.values(db.giveaways).filter(g=>!g.ended).length} actifs`, inline: true },
      { name: '🏆 Top Économie', value: topEco, inline: false },
      { name: '⭐ Top Niveaux', value: topXP, inline: false },
      { name: '⚙️ Config', value: `${Object.keys(db.customCmds).length} cmds perso • ${db.applications.length} candidatures`, inline: false },
    ).setTimestamp().setFooter({ text: `Rapport généré le ${new Date().toLocaleString('fr-FR')}` })] });
  }

  // ══ /profil ══
  if (cmd === 'profil') {
    const t = interaction.options.getMember('membre') || interaction.member;
    const u = getUser(t.id);
    const warns = (db.warns[t.id]||[]).length;
    const needed = u.level * 100;
    const bar  = '█'.repeat(Math.floor((u.xp/needed)*10))+'░'.repeat(10-Math.floor((u.xp/needed)*10));
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${t.user.username}`).setThumbnail(t.user.displayAvatarURL({dynamic:true})).setColor(C('#5865F2')).addFields(
      { name: '💰 Points',     value: `**${u.points}** pts (Rang #${rank(t.id)})`, inline: true },
      { name: '⭐ Niveau',     value: `**${u.level}** (${u.xp}/${needed} XP)`, inline: true },
      { name: '💬 Messages',   value: `${u.messages||0}`, inline: true },
      { name: '⚠️ Warns',      value: `${warns}`, inline: true },
      { name: '📊 Barre XP',   value: `[${bar}] ${Math.floor((u.xp/needed)*100)}%`, inline: false },
      { name: '🎭 Rôles',      value: t.roles.cache.filter(r=>r.id!==interaction.guild.id).map(r=>r.toString()).slice(0,5).join(' ')||'Aucun', inline: false },
    ).setTimestamp()] });
  }

  // ══ /avatar ══
  if (cmd === 'avatar') {
    const u = interaction.options.getUser('membre') || interaction.user;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${u.username}`).setImage(u.displayAvatarURL({dynamic:true,size:1024})).setColor(C('#5865F2')).addFields({name:'🔗 Liens',value:`[PNG](${u.displayAvatarURL({format:'png',size:1024})}) | [WebP](${u.displayAvatarURL({format:'webp',size:1024})})`})] });
  }

  // ══ BOUTIQUE ══
  if (cmd === 'ajouter-article') {
    const article = {
      id:           Date.now(),
      name:         interaction.options.getString('nom'),
      price:        interaction.options.getString('prix'),
      link:         interaction.options.getString('lien'),
      description:  interaction.options.getString('description') || '',
      emoji:        interaction.options.getString('emoji') || '🛒',
      category:     interaction.options.getString('categorie') || '',
      stock:        interaction.options.getInteger('stock') ?? -1,
      image:        interaction.options.getString('image') || '',
      deliveryTime: interaction.options.getString('livraison') || 'Instantanée',
      visible:      true,
      createdAt:    new Date().toLocaleString('fr-FR'),
    };
    db.articles.push(article);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Article ajouté !').setColor(C('#10d982')).addFields(
      { name: '🛒 Article',    value: `${article.emoji} ${article.name}`, inline: true },
      { name: '💰 Prix',       value: article.price, inline: true },
      { name: '📦 Stock',      value: article.stock === -1 ? '♾️ Illimité' : `${article.stock}`, inline: true },
      { name: '🔗 Lien',       value: article.link.substring(0, 60)+'...', inline: false },
    ).setTimestamp().setFooter({ text: `Utilisez /publier-article ${article.name} pour le publier` })] });
  }

  if (cmd === 'supprimer-article') {
    const nom = interaction.options.getString('nom').toLowerCase();
    const idx = db.articles.findIndex(a => a.name.toLowerCase().includes(nom));
    if (idx < 0) return interaction.reply({ embeds: [ERR(`Article "${nom}" introuvable.`)], ephemeral: true });
    const a = db.articles.splice(idx, 1)[0];
    return interaction.reply({ embeds: [OK('Article supprimé', `**${a.emoji} ${a.name}** a été retiré de la boutique.`)] });
  }

  if (cmd === 'modifier-article') {
    const nom = interaction.options.getString('nom').toLowerCase();
    const a   = db.articles.find(x => x.name.toLowerCase().includes(nom));
    if (!a) return interaction.reply({ embeds: [ERR(`"${nom}" introuvable.`)], ephemeral: true });
    const prix  = interaction.options.getString('prix');
    const stock = interaction.options.getInteger('stock');
    const desc  = interaction.options.getString('description');
    if (prix)  a.price       = prix;
    if (stock !== null) a.stock = stock;
    if (desc)  a.description = desc;
    return interaction.reply({ embeds: [OK('Article modifié !', `**${a.emoji} ${a.name}** mis à jour.\nPrix : ${a.price} | Stock : ${a.stock === -1 ? '♾️' : a.stock}`)] });
  }

  if (cmd === 'liste-articles') {
    if (!db.articles.length) return interaction.reply({ embeds: [INF('Boutique vide', 'Ajoutez des articles avec `/ajouter-article`.')] });
    const emb = new EmbedBuilder().setTitle(`🛒 Liste des articles (${db.articles.length})`).setColor(C('#f0b429')).setTimestamp();
    db.articles.forEach(a => {
      const stock = a.stock === -1 ? '♾️' : a.stock === 0 ? '❌' : `✅ ${a.stock}`;
      emb.addFields({ name: `${a.emoji} ${a.name}`, value: `${a.price} • ${stock}${a.category?' • '+a.category:''}`, inline: true });
    });
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'shop') {
    const articles = db.articles.filter(a => a.visible !== false);
    const sellhub  = db.sellhubProducts;
    const total    = articles.length + sellhub.length;
    if (total === 0) return interaction.reply({ embeds: [INF('Boutique vide', 'Aucun article pour l\'instant.')] });
    return interaction.reply({ embeds: [buildShopEmbed()] });
  }

  if (cmd === 'article') {
    const nom = interaction.options.getString('nom').toLowerCase();
    const a   = db.articles.find(x => x.name.toLowerCase().includes(nom));
    if (!a) return interaction.reply({ embeds: [ERR(`"${nom}" introuvable. Voir \`/liste-articles\`.`)], ephemeral: true });
    return interaction.reply({ embeds: [articleEmbed(a)] });
  }

  if (cmd === 'publier-shop') {
    const target  = interaction.options.getChannel('channel') || interaction.channel;
    const mention = interaction.options.getString('mention') || '';
    if (db.articles.length === 0 && db.sellhubProducts.length === 0) return interaction.reply({ embeds: [ERR('Boutique vide.')], ephemeral: true });
    await target.send({ content: mention || undefined, embeds: [buildShopEmbed()] });
    return interaction.reply({ embeds: [OK('Boutique publiée !', `La boutique a été publiée dans ${target}.`)], ephemeral: true });
  }

  if (cmd === 'publier-article') {
    const nom     = interaction.options.getString('nom').toLowerCase();
    const target  = interaction.options.getChannel('channel') || interaction.channel;
    const mention = interaction.options.getString('mention') || '';
    const a       = db.articles.find(x => x.name.toLowerCase().includes(nom));
    if (!a) return interaction.reply({ embeds: [ERR(`"${nom}" introuvable.`)], ephemeral: true });
    await target.send({ content: mention || undefined, embeds: [articleEmbed(a)] });
    return interaction.reply({ embeds: [OK('Article publié !', `**${a.emoji} ${a.name}** publié dans ${target}.`)], ephemeral: true });
  }

  if (cmd === 'config-shop') {
    const cfg = db.shopConfig;
    const n   = interaction.options.getString('nom');
    const col = interaction.options.getString('couleur');
    const ban = interaction.options.getString('banner');
    const ft  = interaction.options.getString('footer');
    if (n)   cfg.name   = n;
    if (col) cfg.color  = col;
    if (ban) cfg.banner = ban;
    if (ft)  cfg.footer = ft;
    return interaction.reply({ embeds: [OK('Config boutique sauvegardée !', `Nom : **${cfg.name}**\nCouleur : ${cfg.color}`)] });
  }

  // ══ GÉNÉRATEURS ══
  if (cmd === 'generer-regles') {
    const type   = interaction.options.getString('type');
    const target = interaction.options.getChannel('channel');
    const rules  = RULES_TEMPLATES[type] || RULES_TEMPLATES.vente;
    const emb    = new EmbedBuilder()
      .setTitle(`📜 Règles du Serveur`)
      .setColor(C('#e74c3c'))
      .setTimestamp()
      .setFooter({ text: 'Le non-respect de ces règles entraîne des sanctions' });
    rules.forEach((r, i) => emb.addFields({ name: `${r.e} ${i+1}. ${r.t}`, value: r.d, inline: false }));
    if (target) {
      await target.send({ embeds: [emb] });
      return interaction.reply({ embeds: [OK('Règles publiées !', `10 règles générées et publiées dans ${target}.`)], ephemeral: true });
    }
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'generer-bienvenue') {
    const style = (interaction.options.getInteger('style') || 1) - 1;
    const tmpl  = WELCOME_TEMPLATES[Math.min(style, WELCOME_TEMPLATES.length - 1)];
    const preview = tmpl.replace('{user}','@Nouveau membre').replace('{server}',interaction.guild.name).replace('{count}',interaction.guild.memberCount.toString());
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('👋 Template de bienvenue généré').setDescription(preview).setColor(C('#5865F2')).setFooter({ text: `Template ${style+1}/4 — Copiez dans vos variables Railway CH_WELCOME` }).setTimestamp()] });
  }

  if (cmd === 'generer-description') {
    const type    = interaction.options.getString('type');
    const variant = (interaction.options.getInteger('variant') || 1) - 1;
    const descs   = DESC_TEMPLATES[type] || DESC_TEMPLATES.digital;
    const desc    = descs[Math.min(variant, descs.length - 1)];
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📝 Description générée — ${type}`).setDescription(desc).setColor(C('#4d8fff')).setFooter({ text: 'Copiez cette description dans /ajouter-article' }).setTimestamp()] });
  }

  // ══ SETUP ══
  const SALON_CONFIGS = {
    shop:       { name: '🛒・boutique',    topic: 'Retrouvez tous nos produits ici. Utilisez /shop pour voir la boutique.' },
    rules:      { name: '📜・règles',       topic: 'Règles du serveur — À lire avant de participer.' },
    welcome:    { name: '👋・bienvenue',    topic: 'Accueil des nouveaux membres.' },
    tickets:    { name: '🎫・tickets',      topic: 'Ouvrez un ticket pour obtenir de l\'aide.' },
    annonces:   { name: '📢・annonces',     topic: 'Annonces officielles du staff.' },
    ventes:     { name: '💰・ventes',       topic: 'Notifications de ventes.' },
    classement: { name: '🏆・classement',   topic: 'Classement des membres.' },
    general:    { name: '💬・général',      topic: 'Salon de discussion général.' },
  };

  if (cmd === 'setup-salon') {
    const type   = interaction.options.getString('type');
    const config = SALON_CONFIGS[type];
    if (!config) return interaction.reply({ embeds: [ERR('Type de salon invalide.')], ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const ch = await interaction.guild.channels.create({ name: config.name, type: ChannelType.GuildText, topic: config.topic });
      // Messages automatiques selon le type
      if (type === 'tickets') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('t_open_cmd').setLabel('📦 Commande').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('t_open_sup').setLabel('🔧 Support').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('t_open_q').setLabel('❓ Question').setStyle(ButtonStyle.Success)
        );
        await ch.send({ embeds: [new EmbedBuilder().setTitle('🎫 Centre de Support').setDescription('Choisissez la catégorie de votre ticket :').setColor(C('#5865F2')).setTimestamp()], components: [row] });
      }
      if (type === 'rules') {
        const rules = RULES_TEMPLATES.vente;
        const emb = new EmbedBuilder().setTitle('📜 Règles du Serveur').setColor(C('#e74c3c')).setTimestamp();
        rules.forEach((r,i) => emb.addFields({name:`${r.e} ${i+1}. ${r.t}`,value:r.d}));
        await ch.send({ embeds: [emb] });
      }
      if (type === 'shop') {
        if (db.articles.length > 0) await ch.send({ embeds: [buildShopEmbed()] });
        else await ch.send({ embeds: [new EmbedBuilder().setTitle('🛒 Boutique').setDescription('Notre boutique arrive bientôt ! Utilisez `/ajouter-article` pour ajouter des produits.').setColor(C('#f0b429')).setTimestamp()] });
      }
      return interaction.editReply({ content: `✅ Salon **${config.name}** créé et configuré : <#${ch.id}>` });
    } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
  }

  if (cmd === 'setup-serveur') {
    const type = interaction.options.getString('type');
    await interaction.deferReply({ ephemeral: true });
    const salons = ['rules', 'welcome', 'shop', 'tickets', 'annonces', 'general'];
    const created = [];
    for (const s of salons) {
      try {
        const cfg = SALON_CONFIGS[s];
        const ch  = await interaction.guild.channels.create({ name: cfg.name, type: ChannelType.GuildText, topic: cfg.topic });
        created.push(`<#${ch.id}>`);
      } catch(e) {}
    }
    // Génère les règles
    const rules = RULES_TEMPLATES[type] || RULES_TEMPLATES.vente;
    const emb = new EmbedBuilder().setTitle('📜 Règles').setColor(C('#e74c3c')).setTimestamp();
    rules.forEach((r,i) => emb.addFields({name:`${r.e} ${i+1}. ${r.t}`,value:r.d}));

    return interaction.editReply({
      embeds: [new EmbedBuilder().setTitle('🚀 Serveur configuré !').setColor(C('#10d982')).setDescription(`**${created.length} salons créés :**\n${created.join('\n')}\n\n📜 Règles générées automatiquement\n🎫 Panel tickets installé\n\n**Prochaines étapes :**\n→ Ajoutez vos articles avec \`/ajouter-article\`\n→ Publiez la boutique avec \`/publier-shop\`\n→ Configurez vos variables Railway (CH_WELCOME, etc.)`).setTimestamp()]
    });
  }

  // ══ EMBEDS ══
  // ══ /bouton ══
  if (cmd === 'bouton') {
    const texte   = interaction.options.getString('texte');
    const lien    = interaction.options.getString('lien');
    const message = interaction.options.getString('message') || '';
    const couleur = interaction.options.getString('couleur') || 'blue';
    const target  = interaction.options.getChannel('channel') || interaction.channel;

    // Valider l'URL
    if (!lien.startsWith('http')) {
      return interaction.reply({ embeds: [ERR('Le lien doit commencer par https://')], ephemeral: true });
    }

    const styleMap = { blue: ButtonStyle.Link, grey: ButtonStyle.Link, danger: ButtonStyle.Link };
    const btn = new ButtonBuilder()
      .setLabel(texte)
      .setStyle(ButtonStyle.Link)
      .setURL(lien);

    const row = new ActionRowBuilder().addComponents(btn);

    const payload = { components: [row] };
    if (message) {
      // Si le message ressemble à un titre d'embed
      payload.embeds = [new EmbedBuilder()
        .setDescription(message)
        .setColor(C('#5865F2'))
        .setTimestamp()];
    } else {
      payload.content = '\u200b'; // Caractère invisible si pas de message
    }

    await target.send(payload);
    return interaction.reply({ embeds: [OK('Bouton envoyé !', `Bouton **${texte}** publié dans ${target}.`)], ephemeral: true });
  }

  // ══ /boutons ══ (jusqu'à 5 boutons liens dans un embed)
  if (cmd === 'boutons') {
    const titre   = interaction.options.getString('titre');
    const desc    = interaction.options.getString('description') || '';
    const couleur = interaction.options.getString('couleur') || '#5865F2';
    const target  = interaction.options.getChannel('channel') || interaction.channel;
    const mention = interaction.options.getString('mention') || '';

    // Collecter les boutons
    const btnsRaw = ['btn1','btn2','btn3','btn4','btn5']
      .map(k => interaction.options.getString(k))
      .filter(Boolean);

    if (!btnsRaw.length) return interaction.reply({ embeds: [ERR('Ajoutez au moins un bouton.')], ephemeral: true });

    const buttons = [];
    const errors  = [];

    for (const raw of btnsRaw) {
      const parts = raw.split('|');
      const label = parts[0]?.trim();
      const url   = parts[1]?.trim();
      if (!label || !url) { errors.push(`"${raw}" — format invalide (utilise texte|lien)`); continue; }
      if (!url.startsWith('http')) { errors.push(`"${url}" — doit commencer par https://`); continue; }
      buttons.push(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
    }

    if (!buttons.length) {
      return interaction.reply({ embeds: [ERR(`Aucun bouton valide.\n${errors.join('\n')}`)], ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(...buttons);

    const emb = new EmbedBuilder()
      .setTitle(titre)
      .setColor(C(couleur))
      .setTimestamp();
    if (desc) emb.setDescription(desc);

    const payload = { embeds: [emb], components: [row] };
    if (mention) payload.content = mention;

    await target.send(payload);

    const warnMsg = errors.length ? `\n\n⚠️ ${errors.length} bouton(s) ignoré(s) :\n${errors.join('\n')}` : '';
    return interaction.reply({
      embeds: [OK(`${buttons.length} bouton(s) envoyé(s) !`, `Publié dans ${target}.${warnMsg}`)],
      ephemeral: true
    });
  }

  if (cmd === 'embed') {
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const ment   = interaction.options.getString('mention') || '';
    const emb    = new EmbedBuilder().setTitle(interaction.options.getString('titre')).setColor(C(interaction.options.getString('couleur') || '#5865F2')).setTimestamp();
    const desc   = interaction.options.getString('description'); if (desc) emb.setDescription(desc);
    const img    = interaction.options.getString('image');       if (img)  emb.setImage(img);
    const thumb  = interaction.options.getString('thumbnail');   if (thumb) emb.setThumbnail(thumb);
    const footer = interaction.options.getString('footer');      if (footer) emb.setFooter({text:footer});
    await target.send({ content: ment || undefined, embeds: [emb] });
    return interaction.reply({ embeds: [OK('Embed envoyé', `Publié dans ${target}.`)], ephemeral: true });
  }

  // ══ /config-boutique ══
  if (cmd === 'config-boutique') {
    const cfg = db.boutiqueConfig;
    const lien    = interaction.options.getString('lien');
    const emailC  = interaction.options.getString('email_contact');
    const emailP  = interaction.options.getString('email_paiement');
    const stripe  = interaction.options.getString('stripe_lien');
    const sumup   = interaction.options.getString('sumup_lien');
    const nom     = interaction.options.getString('nom');
    if (lien)   cfg.lien          = lien;
    if (emailC) cfg.emailContact  = emailC;
    if (emailP) cfg.emailPaiement = emailP;
    if (stripe) cfg.stripeLien    = stripe;
    if (sumup)  cfg.sumupLien     = sumup;
    if (nom)    cfg.nom           = nom;
    return interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('✅ Boutique configurée !')
      .setColor(C('#10d982'))
      .addFields(
        { name: '🏪 Nom',             value: cfg.nom           || '—', inline: true  },
        { name: '🔗 Lien boutique',   value: cfg.lien          || '—', inline: true  },
        { name: '📧 Email contact',   value: cfg.emailContact  || '—', inline: false },
        { name: '💶 Email paiement',  value: cfg.emailPaiement || '—', inline: true  },
        { name: '💳 Stripe',          value: cfg.stripeLien    || '—', inline: true  },
        { name: '💳 Sumup',           value: cfg.sumupLien     || '—', inline: true  },
      )
      .setFooter({ text: 'Vous pouvez aussi définir ces valeurs dans Railway → Variables' })
      .setTimestamp()
    ], ephemeral: true });
  }

  // ══ /ma-boutique ══
  if (cmd === 'ma-boutique') {
    await interaction.deferReply({ ephemeral: true });
    const target  = interaction.options.getChannel('channel') || interaction.channel;
    const mention = interaction.options.getString('mention') || '';
    const cfg     = db.boutiqueConfig;

    // Embed principal boutique
    const mainEmb = new EmbedBuilder()
      .setTitle(`🛒 ${cfg.nom || 'NexusStore'}`)
      .setColor(C('#f0b429'))
      .setDescription(
        '✅ **Livraison instantanée** — Reçois en quelques secondes\n' +
        '🔒 **100% Sécurisé** — Paiements protégés & anonymes\n' +
        '🛠️ **Produits vérifiés** — Tout est testé & garanti\n' +
        '💸 **Remboursement assuré** — Zéro risque, zéro perte\n' +
        '⚡ **Ultra rapide** — Pas d\'attente, pas de blabla'
      )
      .setTimestamp()
      .setFooter({ text: `${cfg.nom || 'NexusStore'} • Paiement 100% sécurisé 🔒` });

    if (cfg.lien) mainEmb.addFields({ name: '🔗 Boutique', value: `[**→ Voir tous les produits**](${cfg.lien})`, inline: false });

    // Boutons paiement
    const buttons = [];
    if (cfg.lien)          buttons.push(new ButtonBuilder().setLabel('🛒 Voir la boutique').setStyle(ButtonStyle.Link).setURL(cfg.lien));
    if (cfg.stripeLien)    buttons.push(new ButtonBuilder().setLabel('💳 Payer par Stripe').setStyle(ButtonStyle.Link).setURL(cfg.stripeLien));
    if (cfg.sumupLien)     buttons.push(new ButtonBuilder().setLabel('💳 Payer par Sumup').setStyle(ButtonStyle.Link).setURL(cfg.sumupLien));

    const payload = { embeds: [mainEmb] };
    if (buttons.length) payload.components = [new ActionRowBuilder().addComponents(...buttons.slice(0, 5))];
    if (mention) payload.content = mention;

    await target.send(payload);

    // Publier chaque article en embed individuel
    if (db.articles.length > 0) {
      for (const art of db.articles.filter(a => a.visible !== false && a.stock !== 0)) {
        const artEmb = articleEmbed(art);
        const artBtns = [];
        if (art.link || art.payButtons?.[0]?.url) {
          artBtns.push(new ButtonBuilder().setLabel('🛒 Acheter').setStyle(ButtonStyle.Link).setURL(art.link || art.payButtons[0].url));
        }
        if (cfg.emailContact) {
          artBtns.push(new ButtonBuilder().setLabel('📧 Contact').setStyle(ButtonStyle.Link).setURL(`mailto:${cfg.emailContact}`));
        }
        const artPayload = { embeds: [artEmb] };
        if (artBtns.length) artPayload.components = [new ActionRowBuilder().addComponents(...artBtns.slice(0, 5))];
        await target.send(artPayload);
        await new Promise(r => setTimeout(r, 600));
      }
    }

    addLog(`🛒 Boutique publiée dans #${target.name}`, '#f0b429');
    return interaction.editReply({ content: `✅ Boutique publiée dans ${target} !` });
  }

  // ══ /contact ══
  if (cmd === 'contact') {
    const cfg = db.boutiqueConfig;
    const emb = new EmbedBuilder()
      .setTitle(`📧 Contact — ${cfg.nom || 'NexusStore'}`)
      .setColor(C('#4d8fff'))
      .setDescription('Notre équipe est disponible pour toute question ou problème.\nRéponse garantie sous 24h.')
      .setTimestamp()
      .setFooter({ text: `${cfg.nom || 'NexusStore'} • Support client` });

    const fields = [];
    if (cfg.emailContact)  fields.push({ name: '📧 Email de contact',   value: `\`${cfg.emailContact}\``,  inline: false });
    if (cfg.emailPaiement) fields.push({ name: '💶 Email paiement',     value: `\`${cfg.emailPaiement}\``, inline: false });
    fields.push({ name: '🎫 Support Discord', value: 'Ouvrez un ticket avec `/ticket`\nRéponse rapide garantie', inline: false });
    if (fields.length) emb.addFields(fields);

    const buttons = [];
    if (cfg.emailContact) buttons.push(new ButtonBuilder().setLabel('📧 Envoyer un email').setStyle(ButtonStyle.Link).setURL(`mailto:${cfg.emailContact}`));
    buttons.push(new ButtonBuilder().setLabel('🎫 Ouvrir un ticket').setStyle(ButtonStyle.Primary).setCustomId('t_open_sup'));

    const payload = { embeds: [emb] };
    if (buttons.length) payload.components = [new ActionRowBuilder().addComponents(...buttons)];
    return interaction.reply(payload);
  }

  // ══ /paiements ══
  if (cmd === 'paiements') {
    const cfg = db.boutiqueConfig;
    const emb = new EmbedBuilder()
      .setTitle('💳 Moyens de Paiement Acceptés')
      .setColor(C('#10d982'))
      .setDescription(`**${cfg.nom || 'NexusStore'}** accepte plusieurs moyens de paiement sécurisés.`)
      .setTimestamp()
      .setFooter({ text: 'Paiement 100% sécurisé 🔒' });

    const fields = [];
    if (cfg.stripeLien)    fields.push({ name: '💳 Carte bancaire (Stripe)', value: `Visa, Mastercard, CB\n[**→ Payer par carte**](${cfg.stripeLien})`, inline: true });
    if (cfg.sumupLien)     fields.push({ name: '💳 Sumup',                   value: `Paiement rapide\n[**→ Payer via Sumup**](${cfg.sumupLien})`, inline: true });
    if (cfg.emailPaiement) fields.push({ name: '💶 Virement / Proches',      value: `PayPal Amis & Famille, Lydia, virement\nContactez : \`${cfg.emailPaiement}\``, inline: false });
    fields.push({ name: '🎫 Commander', value: 'Ouvrez un ticket `/ticket` → choisissez votre produit → choisissez votre moyen de paiement', inline: false });
    if (fields.length) emb.addFields(fields);

    const buttons = [];
    if (cfg.stripeLien) buttons.push(new ButtonBuilder().setLabel('💳 Payer par carte').setStyle(ButtonStyle.Link).setURL(cfg.stripeLien));
    if (cfg.sumupLien)  buttons.push(new ButtonBuilder().setLabel('💳 Payer via Sumup').setStyle(ButtonStyle.Link).setURL(cfg.sumupLien));
    if (cfg.lien)       buttons.push(new ButtonBuilder().setLabel('🛒 Voir la boutique').setStyle(ButtonStyle.Link).setURL(cfg.lien));

    const payload = { embeds: [emb] };
    if (buttons.length) payload.components = [new ActionRowBuilder().addComponents(...buttons.slice(0, 5))];
    return interaction.reply(payload);
  }

  if (cmd === 'annonce') {
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const ment   = interaction.options.getString('mention') || '';
    const img    = interaction.options.getString('image') || '';
    const emb    = new EmbedBuilder().setTitle(`📢 ${interaction.options.getString('titre')}`).setDescription(interaction.options.getString('message')).setColor(C(interaction.options.getString('couleur') || '#5865F2')).setTimestamp().setFooter({ text: `Annoncé par ${interaction.user.username}` });
    if (img) emb.setImage(img);
    await target.send({ content: ment || undefined, embeds: [emb] });
    return interaction.reply({ embeds: [OK('Annonce envoyée', `Publiée dans ${target}.`)], ephemeral: true });
  }

  if (cmd === 'message-perso') {
    const target  = interaction.options.getChannel('channel') || interaction.channel;
    const contenu = interaction.options.getString('contenu');
    await target.send({ content: contenu });
    return interaction.reply({ embeds: [OK('Message envoyé', `Message posté dans ${target}.`)], ephemeral: true });
  }

  if (cmd === 'epingler') {
    const msgId = interaction.options.getString('messageid');
    try {
      const msg = await interaction.channel.messages.fetch(msgId);
      await msg.pin();
      return interaction.reply({ embeds: [OK('Message épinglé !', 'Le message a été épinglé dans ce channel.')] });
    } catch(e) { return interaction.reply({ embeds: [ERR(`Impossible d'épingler : ${e.message}`)], ephemeral: true }); }
  }

  if (cmd === 'regles') {
    const rules = RULES_TEMPLATES.vente;
    const emb   = new EmbedBuilder().setTitle('📜 Règles du Serveur').setColor(C('#e74c3c')).setTimestamp().setFooter({ text: 'Non-respect = sanctions' });
    rules.slice(0,7).forEach((r,i) => emb.addFields({name:`${r.e} ${i+1}. ${r.t}`,value:r.d.substring(0,100)}));
    return interaction.reply({ embeds: [emb] });
  }

  // ══ MODÉRATION ══
  if (cmd === 'warn') {
    const t = interaction.options.getMember('membre');
    const r = interaction.options.getString('raison');
    if (!db.warns[t.id]) db.warns[t.id] = [];
    db.warns[t.id].push({ reason: r, modId: interaction.user.id, date: new Date().toLocaleString('fr-FR') });
    const total = db.warns[t.id].length;
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ Avertissement').setColor(C('#f0b429')).addFields({ name: '👤 Membre', value: `${t}`, inline: true },{ name: '📝 Raison', value: r, inline: true },{ name: '🔢 Total', value: `${total}`, inline: true }).setTimestamp()] });
    t.send({ embeds: [new EmbedBuilder().setTitle('⚠️ Avertissement reçu').setDescription(`**Serveur :** ${interaction.guild.name}\n**Raison :** ${r}\n**Total :** ${total} warn(s)\n\n⚠️ ${total >= 3 ? 'Attention : 3 warns = sanctions plus sévères.' : 'Merci de respecter les règles.'}`).setColor(C('#f0b429')).setTimestamp()] }).catch(() => {});
    if (CH_LOGS) { const l = interaction.guild.channels.cache.get(CH_LOGS); if (l) l.send({ embeds: [new EmbedBuilder().setTitle('⚠️ Warn').setColor(C('#f0b429')).addFields({name:'Membre',value:`${t.user.username} (${t.id})`},{name:'Raison',value:r},{name:'Modérateur',value:interaction.user.username},{name:'Total',value:`${total}`}).setTimestamp()] }); }
    return;
  }

  if (cmd === 'warns') {
    const t     = interaction.options.getMember('membre');
    const warns = db.warns[t.id] || [];
    const emb   = new EmbedBuilder().setTitle(`⚠️ Warns — ${t.user.username}`).setColor(C('#f0b429'));
    if (!warns.length) emb.setDescription('✅ Aucun avertissement.');
    else warns.forEach((w, i) => emb.addFields({ name: `#${i+1} • ${w.date}`, value: w.reason }));
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'clearwarns') {
    const t = interaction.options.getMember('membre');
    db.warns[t.id] = [];
    return interaction.reply({ embeds: [OK('Warns effacés', `Les avertissements de ${t} ont été supprimés.`)] });
  }

  if (cmd === 'sanctions') {
    const t     = interaction.options.getMember('membre');
    const warns = db.warns[t.id] || [];
    const emb   = new EmbedBuilder().setTitle(`📋 Sanctions — ${t.user.username}`).setColor(C('#ff4d4d')).addFields({ name: '⚠️ Avertissements', value: `${warns.length}`, inline: true },{ name: '💰 Points', value: `${getUser(t.id).points}`, inline: true },{ name: '⭐ Niveau', value: `${getUser(t.id).level}`, inline: true });
    warns.forEach((w,i) => emb.addFields({name:`Warn #${i+1}`,value:`${w.date}: ${w.reason}`}));
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'kick') {
    const t = interaction.options.getMember('membre');
    const r = interaction.options.getString('raison') || 'Aucune raison';
    if (!t.kickable) return interaction.reply({ embeds: [ERR('Impossible d\'expulser.')], ephemeral: true });
    await t.kick(r);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('👢 Expulsé').setColor(C('#ff4d4d')).addFields({name:'Membre',value:t.user.username,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()] });
    if (CH_LOGS) { const l = interaction.guild.channels.cache.get(CH_LOGS); if (l) l.send({ embeds: [new EmbedBuilder().setTitle('👢 Kick').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${t.user.username} (${t.id})`},{name:'Raison',value:r},{name:'Modérateur',value:interaction.user.username}).setTimestamp()] }); }
    return;
  }

  if (cmd === 'ban') {
    const t = interaction.options.getMember('membre');
    const r = interaction.options.getString('raison') || 'Aucune raison';
    if (!t.bannable) return interaction.reply({ embeds: [ERR('Impossible de bannir.')], ephemeral: true });
    t.send({ embeds: [new EmbedBuilder().setTitle('🔨 Banni').setDescription(`**Serveur :** ${interaction.guild.name}\n**Raison :** ${r}`).setColor(C('#ff4d4d')).setTimestamp()] }).catch(() => {});
    await t.ban({ reason: r });
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔨 Banni').setColor(C('#ff4d4d')).addFields({name:'Membre',value:t.user.username,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()] });
    if (CH_LOGS) { const l = interaction.guild.channels.cache.get(CH_LOGS); if (l) l.send({ embeds: [new EmbedBuilder().setTitle('🔨 Ban').setColor(C('#ff4d4d')).addFields({name:'Membre',value:`${t.user.username} (${t.id})`},{name:'Raison',value:r},{name:'Modérateur',value:interaction.user.username}).setTimestamp()] }); }
    return;
  }

  if (cmd === 'unban') {
    try { await interaction.guild.members.unban(interaction.options.getString('userid')); return interaction.reply({ embeds: [OK('Débanni', 'Utilisateur débanni avec succès.')] }); }
    catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); }
  }

  if (cmd === 'mute') {
    const t   = interaction.options.getMember('membre');
    const min = interaction.options.getInteger('minutes') || 10;
    const r   = interaction.options.getString('raison') || 'Aucune raison';
    try { await t.timeout(min*60000, r); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔇 Sourdine').setColor(C('#f0b429')).addFields({name:'Membre',value:`${t}`,inline:true},{name:'Durée',value:`${min}min`,inline:true},{name:'Raison',value:r,inline:true}).setTimestamp()] }); }
    catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); }
  }

  if (cmd === 'unmute') {
    try { await interaction.options.getMember('membre').timeout(null); return interaction.reply({ embeds: [OK('Sourdine levée', 'Le membre peut de nouveau parler.')] }); }
    catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); }
  }

  if (cmd === 'clear') {
    try { const d = await interaction.channel.bulkDelete(interaction.options.getInteger('nombre'), true); return interaction.reply({ embeds: [OK(`${d.size} messages supprimés`, '')], ephemeral: true }); }
    catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); }
  }

  if (cmd === 'lock')   { await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false }); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔒 Channel verrouillé').setColor(C('#ff4d4d')).setTimestamp()] }); }
  if (cmd === 'unlock') { await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null  }); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔓 Channel déverrouillé').setColor(C('#10d982')).setTimestamp()] }); }
  if (cmd === 'slowmode') { await interaction.channel.setRateLimitPerUser(interaction.options.getInteger('secondes')); return interaction.reply({ embeds: [OK('Slow mode mis à jour', '')] }); }

  // ══ TICKETS ══
  if (cmd === 'ticket') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const r = await openTicket(interaction.guild, interaction.user);
      if (r.already) return interaction.editReply({ content: `❌ Ticket existant : <#${r.channel.id}>` });
      return interaction.editReply({ content: `✅ Ticket créé : <#${r.channel.id}>` });
    } catch(e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
  }

  if (cmd === 'fermer') {
    if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ embeds: [ERR('Pas dans un ticket.')], ephemeral: true });
    await interaction.reply({ content: '🔒 Fermeture dans 5 secondes...' });
    return closeTicket(interaction.channel, interaction.user);
  }

  if (cmd === 'add') {
    const t = interaction.options.getMember('membre');
    await interaction.channel.permissionOverwrites.edit(t.id, { ViewChannel: true, SendMessages: true });
    return interaction.reply({ embeds: [OK('Membre ajouté', `${t} a maintenant accès à ce ticket.`)] });
  }

  if (cmd === 'retirer') {
    const t = interaction.options.getMember('membre');
    await interaction.channel.permissionOverwrites.edit(t.id, { ViewChannel: false });
    return interaction.reply({ embeds: [OK('Membre retiré', `${t} n'a plus accès à ce ticket.`)] });
  }

  if (cmd === 'renommer-ticket') {
    if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ embeds: [ERR('Pas dans un ticket.')], ephemeral: true });
    const nom = interaction.options.getString('nom').toLowerCase().replace(/\s+/g,'-');
    await interaction.channel.setName(`ticket-${nom}`);
    return interaction.reply({ embeds: [OK('Ticket renommé', `Renommé en \`ticket-${nom}\``)] });
  }

  // ══ ÉCONOMIE ══
  if (cmd === 'points') {
    const t = interaction.options.getUser('membre') || interaction.user;
    const u = getUser(t.id);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`💰 ${t.username}`).setThumbnail(t.displayAvatarURL({dynamic:true})).setColor(C('#f0b429')).addFields({name:'💰 Points',value:`**${u.points}**`,inline:true},{name:'🏆 Rang',value:`#${rank(t.id)}`,inline:true},{name:'📈 Total gagné',value:`${u.totalEarned}`,inline:true}).setTimestamp()] });
  }

  if (cmd === 'niveau') {
    const t      = interaction.options.getUser('membre') || interaction.user;
    const u      = getUser(t.id);
    const needed = u.level * 100;
    const pct    = Math.floor((u.xp / needed) * 100);
    const bar    = '█'.repeat(Math.floor(pct/10)) + '░'.repeat(10-Math.floor(pct/10));
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`⭐ Niveau — ${t.username}`).setThumbnail(t.displayAvatarURL({dynamic:true})).setColor(C('#9d6fff')).addFields({name:'⭐ Niveau',value:`**${u.level}**`,inline:true},{name:'📊 XP',value:`${u.xp}/${needed}`,inline:true},{name:'💬 Messages',value:`${u.messages||0}`,inline:true},{name:'📈 Progression',value:`[${bar}] ${pct}%`,inline:false}).setTimestamp()] });
  }

  if (cmd === 'daily') {
    const u  = getUser(interaction.user.id);
    const cd = 24 * 3600000;
    if (Date.now() - u.lastDaily < cd) {
      const h = Math.ceil((cd - (Date.now()-u.lastDaily)) / 3600000);
      return interaction.reply({ embeds: [ERR(`Daily déjà récupéré ! Reviens dans **${h}h**.`)], ephemeral: true });
    }
    const gain = Math.floor(Math.random()*151)+50;
    u.lastDaily = Date.now();
    addPts(interaction.user.id, gain);
    addXP(interaction.user.id, 20);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎁 Daily récupéré !').setDescription(`+**${gain} points** reçus !\nTotal : **${u.points} points** | XP : **${u.xp}/${u.level*100}**`).setColor(C('#10d982')).setTimestamp()] });
  }

  if (cmd === 'classement') {
    const top    = Object.entries(db.economy).sort(([,a],[,b])=>b.points-a.points).slice(0,10);
    const medals = ['🥇','🥈','🥉'];
    const desc   = top.length ? top.map(([id,d],i)=>`${medals[i]||`**${i+1}.**`} <@${id}> — **${d.points} pts**`).join('\n') : 'Aucun joueur.';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Classement Points').setDescription(desc).setColor(C('#f0b429')).setTimestamp()] });
  }

  if (cmd === 'classement-xp') {
    const top    = Object.entries(db.economy).sort(([,a],[,b])=>b.level-a.level).slice(0,10);
    const medals = ['🥇','🥈','🥉'];
    const desc   = top.length ? top.map(([id,d],i)=>`${medals[i]||`**${i+1}.**`} <@${id}> — Niveau **${d.level}** (${d.xp} XP)`).join('\n') : 'Aucun joueur.';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⭐ Classement XP').setDescription(desc).setColor(C('#9d6fff')).setTimestamp()] });
  }

  if (cmd === 'donner-points') {
    const t = interaction.options.getUser('membre');
    const n = interaction.options.getInteger('montant');
    addPts(t.id, n);
    return interaction.reply({ embeds: [OK('Points donnés', `**+${n} pts** à <@${t.id}>. Total : **${getUser(t.id).points} pts**`)] });
  }

  if (cmd === 'shop-roles') {
    if (!db.roleShop.length) return interaction.reply({ embeds: [INF('Boutique de rôles vide', 'Ajoutez des rôles avec `/ajouter-role-shop`.')] });
    const u   = getUser(interaction.user.id);
    const emb = new EmbedBuilder().setTitle('🛍️ Boutique de Rôles').setColor(C('#f0b429')).setDescription(`Vos points : **${u.points} pts**\n\nUtilisez \`/acheter-role\` pour acheter.`);
    db.roleShop.forEach(r => { const role = interaction.guild.roles.cache.get(r.roleId); if (role) emb.addFields({ name: `@${role.name}`, value: `${r.price} points`, inline: true }); });
    return interaction.reply({ embeds: [emb] });
  }

  if (cmd === 'acheter-role') {
    const role = interaction.options.getRole('role');
    const item = db.roleShop.find(r => r.roleId === role.id);
    if (!item) return interaction.reply({ embeds: [ERR('Ce rôle n\'est pas en vente.')], ephemeral: true });
    const u = getUser(interaction.user.id);
    if (u.points < item.price) return interaction.reply({ embeds: [ERR(`Points insuffisants. Vous avez **${u.points} pts**, il faut **${item.price} pts**.`)], ephemeral: true });
    u.points -= item.price;
    await interaction.member.roles.add(role);
    return interaction.reply({ embeds: [OK('Rôle acheté !', `Tu as obtenu **@${role.name}** pour **${item.price} pts** !\nSolde : **${u.points} pts**`)] });
  }

  if (cmd === 'ajouter-role-shop') {
    const role = interaction.options.getRole('role');
    const prix = interaction.options.getInteger('prix');
    const i    = db.roleShop.findIndex(r => r.roleId === role.id);
    if (i >= 0) db.roleShop[i].price = prix;
    else db.roleShop.push({ roleId: role.id, price: prix });
    return interaction.reply({ embeds: [OK('Rôle en vente !', `**@${role.name}** est maintenant disponible pour **${prix} points**.`)] });
  }

  // ══ GIVEAWAY ══
  if (cmd === 'giveaway') {
    const prix    = interaction.options.getString('prix');
    const minutes = interaction.options.getInteger('minutes');
    const target  = interaction.options.getChannel('channel') || interaction.channel;
    const end     = Date.now() + minutes * 60000;
    const row     = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gw_join').setLabel('🎉 Participer').setStyle(ButtonStyle.Primary));
    const msg     = await target.send({ embeds: [new EmbedBuilder().setTitle('🎉 GIVEAWAY').setDescription(`**Prix :** ${prix}\n\n⏱️ **Fin :** ${new Date(end).toLocaleString('fr-FR')}\n👥 **Participants :** 0\n\nClique sur le bouton pour participer !`).setColor(C('#f0b429')).setTimestamp(new Date(end)).setFooter({text:`Organisé par ${interaction.user.username}`})], components: [row] });
    db.giveaways[msg.id] = { prize: prix, end, channel: target.id, entries: new Set(), ended: false };
    return interaction.reply({ embeds: [OK('Giveaway créé !', `**${prix}** dans ${target} — ${minutes} min.`)], ephemeral: true });
  }

  if (cmd === 'giveaway-fin') {
    const id = interaction.options.getString('messageid');
    if (!db.giveaways[id]) return interaction.reply({ embeds: [ERR('Giveaway introuvable.')], ephemeral: true });
    await endGiveaway(id, interaction.guild);
    return interaction.reply({ embeds: [OK('Terminé !', 'Le gagnant a été tiré au sort.')], ephemeral: true });
  }

  if (cmd === 'giveaway-reroll') {
    const gw = db.giveaways[interaction.options.getString('messageid')];
    if (!gw) return interaction.reply({ embeds: [ERR('Introuvable.')], ephemeral: true });
    const entries = [...gw.entries];
    if (!entries.length) return interaction.reply({ embeds: [ERR('Aucun participant.')], ephemeral: true });
    const winner = entries[Math.floor(Math.random() * entries.length)];
    gw.winner = winner; addPts(winner, 100);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Nouveau Gagnant !').setDescription(`**Prix :** ${gw.prize}\n**Gagnant :** <@${winner}>`).setColor(C('#10d982')).setTimestamp()] });
  }

  // ══ SONDAGE ══
  if (cmd === 'sondage') {
    const question = interaction.options.getString('question');
    const opts     = interaction.options.getString('options').split('|').map(s=>s.trim()).filter(Boolean).slice(0,9);
    if (opts.length < 2) return interaction.reply({ embeds: [ERR('Minimum 2 options (séparées par |).')], ephemeral: true });
    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
    const msg    = await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📊 ${question}`).setDescription(opts.map((o,i)=>`${emojis[i]} ${o}`).join('\n')).setColor(C('#4d8fff')).setTimestamp().setFooter({text:`Sondage par ${interaction.user.username}`})], fetchReply: true });
    db.polls[msg.id] = { question, options: opts, votes: Object.fromEntries(opts.map((_,i)=>[i,[]])) };
    for (let i=0; i<opts.length; i++) await msg.react(emojis[i]);
    return;
  }

  if (cmd === 'resultats') {
    const poll = db.polls[interaction.options.getString('messageid')];
    if (!poll) return interaction.reply({ embeds: [ERR('Sondage introuvable.')], ephemeral: true });
    const total = Object.values(poll.votes).reduce((s,v)=>s+v.length,0);
    const emb   = new EmbedBuilder().setTitle(`📊 Résultats — ${poll.question}`).setColor(C('#4d8fff'));
    poll.options.forEach((o,i)=>{
      const votes = poll.votes[i]?.length||0;
      const pct   = total>0?Math.round((votes/total)*100):0;
      const bar   = '█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10));
      emb.addFields({name:o,value:`[${bar}] **${pct}%** (${votes} vote(s))`});
    });
    emb.setFooter({text:`${total} vote(s) au total`}).setTimestamp();
    return interaction.reply({ embeds: [emb] });
  }

  // ══ COMMANDES PERSO ══
  if (cmd === 'cmd-ajouter') {
    const nom = interaction.options.getString('nom').toLowerCase().replace(/\s+/g,'-');
    db.customCmds[nom] = { reponse: interaction.options.getString('reponse'), auteur: interaction.user.username, date: new Date().toLocaleString('fr-FR') };
    return interaction.reply({ embeds: [OK('Commande créée !', `\`/cmd ${nom}\` est maintenant disponible.`)] });
  }
  if (cmd === 'cmd-supprimer') {
    const nom = interaction.options.getString('nom').toLowerCase();
    if (!db.customCmds[nom]) return interaction.reply({ embeds: [ERR(`\`${nom}\` introuvable.`)], ephemeral: true });
    delete db.customCmds[nom];
    return interaction.reply({ embeds: [OK('Supprimée', `La commande \`${nom}\` a été supprimée.`)] });
  }
  if (cmd === 'cmd-liste') {
    const cmds = Object.entries(db.customCmds);
    if (!cmds.length) return interaction.reply({ embeds: [INF('Commandes perso', 'Aucune. Créez-en avec `/cmd-ajouter`.')] });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`⚙️ Commandes perso (${cmds.length})`).setDescription(cmds.map(([n,d])=>`**\`/cmd ${n}\`** — ${d.reponse.substring(0,60)}`).join('\n')).setColor(C('#4d8fff')).setTimestamp()] });
  }
  if (cmd === 'cmd') {
    const c = db.customCmds[interaction.options.getString('nom').toLowerCase()];
    if (!c) return interaction.reply({ embeds: [ERR('Commande introuvable. Voir `/cmd-liste`.')], ephemeral: true });
    return interaction.reply({ content: c.reponse });
  }

  // ══ RÔLES ══
  if (cmd === 'donner-role') {
    const t = interaction.options.getMember('membre'), r = interaction.options.getRole('role');
    try { await t.roles.add(r); return interaction.reply({ embeds: [OK('Rôle donné', `**@${r.name}** → ${t}`)], ephemeral: true }); }
    catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); }
  }
  if (cmd === 'retirer-role') {
    const t = interaction.options.getMember('membre'), r = interaction.options.getRole('role');
    try { await t.roles.remove(r); return interaction.reply({ embeds: [OK('Rôle retiré', `**@${r.name}** retiré de ${t}`)], ephemeral: true }); }
    catch(e) { return interaction.reply({ embeds: [ERR(e.message)], ephemeral: true }); }
  }

  if (cmd === 'reaction-role') {
    const titre  = interaction.options.getString('titre');
    const paires = interaction.options.getString('paires');
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const pairs  = paires.split('|').map(p=>p.trim()).filter(Boolean);
    const rrMap  = {};
    const lines  = [];
    for (const p of pairs) {
      const [emoji, roleId] = p.split(':');
      if (!emoji || !roleId) continue;
      rrMap[emoji.trim()] = roleId.trim();
      const role = interaction.guild.roles.cache.get(roleId.trim());
      lines.push(`${emoji.trim()} → ${role ? `@${role.name}` : roleId}`);
    }
    const emb = new EmbedBuilder().setTitle(titre).setDescription('Cliquez sur une réaction pour obtenir le rôle correspondant :\n\n' + lines.join('\n')).setColor(C('#f0b429')).setTimestamp();
    const msg = await target.send({ embeds: [emb] });
    db.reactionRoles[msg.id] = rrMap;
    for (const emoji of Object.keys(rrMap)) await msg.react(emoji).catch(()=>{});
    return interaction.reply({ embeds: [OK('Reaction roles créé !', `${Object.keys(rrMap).length} rôle(s) configuré(s) dans ${target}.`)], ephemeral: true });
  }

  // ══ CANDIDATURES ══
  if (cmd === 'postuler') {
    const modal = new ModalBuilder().setCustomId('app_modal').setTitle('📝 Candidature');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q1').setLabel('Pourquoi veux-tu rejoindre l\'équipe ?').setStyle(TextInputStyle.Paragraph).setMinLength(30).setMaxLength(500).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q2').setLabel('Quelle est ton expérience ?').setStyle(TextInputStyle.Paragraph).setMinLength(20).setMaxLength(300).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_q3').setLabel('Disponibilité par semaine ?').setStyle(TextInputStyle.Short).setRequired(true))
    );
    return interaction.showModal(modal);
  }

  if (cmd === 'candidatures') {
    if (!db.applications.length) return interaction.reply({ embeds: [INF('Candidatures', 'Aucune.')], ephemeral: true });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📋 Candidatures (${db.applications.length})`).setColor(C('#f0b429')).setDescription(db.applications.map((a,i)=>`**${i+1}.** ${a.username} — ${a.status} — ${a.date}`).join('\n')).setTimestamp()], ephemeral: true });
  }
});

// ─── WEBHOOK SERVER ──────────────────────────────────────────
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.json({ status: 'ok', bot: client.user?.tag, articles: db.articles.length, commands: COMMANDS.length }));
app.post('/sellhub', async (req, res) => {
  res.status(200).json({ ok: true });
  const { event, data } = req.body || {};
  if ((event === 'order.created' || event === 'order.completed') && CH_SALES) {
    const guild = client.guilds.cache.get(GUILD_ID);
    const ch    = guild?.channels.cache.get(CH_SALES);
    if (ch) {
      const o = data || {};
      ch.send({ embeds: [new EmbedBuilder().setTitle('💰 Nouvelle Vente !').setColor(C('#10d982')).addFields({name:'📦 Produit',value:o.product?.name||o.productName||'—',inline:true},{name:'💵 Montant',value:o.amount?parseFloat(o.amount).toFixed(2)+'€':'—',inline:true},{name:'📧 Client',value:o.email||'Anonyme',inline:true}).setTimestamp().setFooter({text:'Sellhub'})] });
    }
    if (data?.discordId && ROLE_VIP) {
      const g = client.guilds.cache.get(GUILD_ID);
      const m = await g?.members.fetch(data.discordId).catch(()=>null);
      if (m) { const r = g.roles.cache.get(ROLE_VIP); if (r) m.roles.add(r).catch(()=>{}); addPts(data.discordId, 50); }
    }
  }
});
app.listen(PORT, () => log(`🌐 Webhook sur port ${PORT}`));

client.login(TOKEN).catch(e => { console.error('❌', e.message); process.exit(1); });

