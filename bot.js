// ═══════════════════════════════════════════════════════════
//  NexusBot — Bot Discord Complet
//  Slash commands, tickets, Sellhub, auto-rôles, bienvenue
//
//  ⚙️  Configurez les variables d'environnement sur Railway :
//  DISCORD_TOKEN, CLIENT_ID, GUILD_ID, SELLHUB_KEY (optionnel)
// ═══════════════════════════════════════════════════════════

const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, ChannelType, REST, Routes,
  SlashCommandBuilder, Events
} = require('discord.js');

const express = require('express');

// ─── CONFIG (depuis variables d'environnement Railway) ──────
const TOKEN      = process.env.DISCORD_TOKEN;
const CLIENT_ID  = process.env.CLIENT_ID;
const GUILD_ID   = process.env.GUILD_ID;
const SH_KEY     = process.env.SELLHUB_KEY || '';
const PORT       = process.env.PORT || 3000;

// Channels (optionnel — IDs à renseigner si besoin)
const CH_WELCOME = process.env.CH_WELCOME || '';
const CH_BYE     = process.env.CH_BYE     || '';
const CH_SALES   = process.env.CH_SALES   || '';
const CH_LOGS    = process.env.CH_LOGS    || '';
const CH_TICKETS = process.env.CH_TICKETS || ''; // catégorie

// Rôles (optionnel)
const ROLE_MEMBER  = process.env.ROLE_MEMBER  || '';
const ROLE_VIP     = process.env.ROLE_VIP     || '';
const ROLE_SUPPORT = process.env.ROLE_SUPPORT || '';
const STORE_URL    = process.env.STORE_URL    || 'https://votre-store.sellhub.cx';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Variables manquantes : DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

// ─── SLASH COMMANDS ─────────────────────────────────────────
const COMMANDS = [
  new SlashCommandBuilder().setName('ping').setDescription('🏓 Vérifie si le bot est en ligne'),
  new SlashCommandBuilder().setName('shop').setDescription('🛒 Affiche la boutique'),
  new SlashCommandBuilder().setName('produit').setDescription('🛒 Affiche un produit').addStringOption(o => o.setName('nom').setDescription('Nom du produit').setRequired(true)),
  new SlashCommandBuilder().setName('regles').setDescription('📜 Affiche les règles'),
  new SlashCommandBuilder().setName('ticket').setDescription('🎫 Ouvre un ticket'),
  new SlashCommandBuilder().setName('fermer').setDescription('🔒 Ferme le ticket actuel'),
  new SlashCommandBuilder().setName('info').setDescription('ℹ️ Infos sur le serveur'),
  new SlashCommandBuilder().setName('commande').setDescription('📦 Vérifier une commande').addStringOption(o => o.setName('email').setDescription('Email de commande').setRequired(true)),
  new SlashCommandBuilder().setName('donner-role').setDescription('🎭 Donne un rôle').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('retirer-role').setDescription('🎭 Retire un rôle').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('🗑️ Supprime des messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o => o.setName('nombre').setDescription('Nombre (max 100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('annonce').setDescription('📢 Annonce embed').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName('message').setDescription('Contenu').setRequired(true)).addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(false)),
].map(c => c.toJSON());

// ─── CLIENT ─────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

const ticketMap = new Map();
let shopProducts = [];

// ─── REGISTER COMMANDS ──────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: COMMANDS });
    console.log(`✅ ${COMMANDS.length} slash commands enregistrées`);
  } catch (e) {
    console.error('❌ Slash commands:', e.message);
  }
}

// ─── SELLHUB ────────────────────────────────────────────────
async function fetchProducts() {
  if (!SH_KEY) return [];
  try {
    const res = await fetch('https://dash.sellhub.cx/api/sellhub/products', {
      headers: { Authorization: SH_KEY }
    });
    const data = await res.json();
    shopProducts = data.data || data.products || (Array.isArray(data) ? data : []);
    console.log(`🛒 ${shopProducts.length} produits Sellhub`);
    return shopProducts;
  } catch (e) {
    console.error('Sellhub:', e.message);
    return [];
  }
}

// ─── HELPERS ────────────────────────────────────────────────
const C = h => parseInt((h || '#5865F2').replace('#', ''), 16);

function shopEmbed(products) {
  const emb = new EmbedBuilder().setTitle('🛒 Boutique').setColor(C('#635BFF')).setTimestamp().setFooter({ text: 'Paiement sécurisé • Sellhub' });
  if (!products.length) { emb.setDescription('Aucun produit disponible.'); return emb; }
  products.slice(0, 10).forEach(p => {
    const name = p.name || p.title || 'Produit';
    const price = p.price != null ? parseFloat(p.price).toFixed(2) + '€' : '—';
    const link = p.url || p.checkoutUrl || STORE_URL;
    const stock = p.stock != null ? (p.stock === 0 ? '❌ Rupture' : `✅ ${p.stock}`) : '✅';
    emb.addFields({ name: `${name} — ${price}`, value: `${stock}\n[**→ Acheter**](${link})`, inline: true });
  });
  if (STORE_URL) emb.addFields({ name: '\u200b', value: `[🌐 Voir la boutique](${STORE_URL})`, inline: false });
  return emb;
}

function productEmbed(p) {
  const name = p.name || p.title || 'Produit';
  const price = p.price != null ? parseFloat(p.price).toFixed(2) + '€' : '—';
  const desc = (p.description || '').replace(/<[^>]+>/g, '').substring(0, 400);
  const link = p.url || p.checkoutUrl || STORE_URL;
  const stock = p.stock != null ? (p.stock === 0 ? '❌ En rupture' : `✅ ${p.stock} dispo`) : '✅ Disponible';
  const emb = new EmbedBuilder().setTitle(`🛒 ${name}`).setDescription(desc || 'Aucune description.').setColor(C('#635BFF')).addFields({ name: '💰 Prix', value: `**${price}**`, inline: true }, { name: '📦 Stock', value: stock, inline: true }, { name: '🔗 Acheter', value: link ? `[**Payer**](${link})` : '—', inline: false }).setTimestamp().setFooter({ text: 'Sellhub • Paiement sécurisé' });
  if (p.image || p.thumbnail) emb.setImage(p.image || p.thumbnail);
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
  if (ROLE_SUPPORT) {
    perms.push({ id: ROLE_SUPPORT, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  }
  const opts = { name: chName, type: ChannelType.GuildText, topic: `Ticket de ${user.username} (${user.id})`, permissionOverwrites: perms };
  if (CH_TICKETS) {
    const cat = guild.channels.cache.get(CH_TICKETS);
    if (cat) opts.parent = CH_TICKETS;
  }
  const channel = await guild.channels.create(opts);
  ticketMap.set(user.id, channel.id);

  const emb = new EmbedBuilder().setTitle('🎫 Ticket de Support').setDescription(`Bonjour ${user} ! Notre équipe vous répond rapidement.\n\nDécrivez votre demande ci-dessous.`).setColor(C('#5865F2')).addFields({ name: '📋 Catégories', value: '📦 Commande\n🔧 Support technique\n❓ Question générale', inline: true }, { name: '⏱️ Réponse', value: 'Généralement < 24h', inline: true }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger));
  await channel.send({ content: `${user}`, embeds: [emb], components: [row] });

  if (CH_LOGS) {
    const logCh = guild.channels.cache.get(CH_LOGS);
    if (logCh) logCh.send({ embeds: [new EmbedBuilder().setTitle('📋 Nouveau Ticket').setColor(C('#FAA61A')).addFields({ name: 'Utilisateur', value: `${user} (${user.id})` }, { name: 'Channel', value: `<#${channel.id}>` }).setTimestamp()] });
  }
  return { channel };
}

async function closeTicket(channel, closer) {
  const match = (channel.topic || '').match(/\((\d+)\)/);
  if (match) ticketMap.delete(match[1]);
  await channel.send({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Fermé').setDescription(`Fermé par ${closer}.`).setColor(C('#F04747')).setTimestamp()] });
  if (CH_LOGS) {
    const logCh = channel.guild.channels.cache.get(CH_LOGS);
    if (logCh) logCh.send({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Fermé').setColor(C('#F04747')).addFields({ name: 'Channel', value: channel.name }, { name: 'Fermé par', value: `${closer}` }).setTimestamp()] });
  }
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

// ─── EVENTS ─────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log(`\n✅ ${client.user.tag} en ligne !`);
  client.user.setActivity('🛒 Boutique Sellhub', { type: 3 });
  await registerCommands();
  await fetchProducts();
  setInterval(fetchProducts, 5 * 60 * 1000);
});

client.on(Events.GuildMemberAdd, async member => {
  if (CH_WELCOME) {
    const ch = member.guild.channels.cache.get(CH_WELCOME);
    if (ch) {
      ch.send({ embeds: [new EmbedBuilder().setTitle(`👋 Bienvenue sur ${member.guild.name} !`).setDescription(`Bienvenue **${member.user.username}** ! 🎉\n\n🛒 Découvrez nos produits${CH_SALES ? ` dans <#${CH_SALES}>` : ''}\n🎫 Pour toute aide, ouvrez un ticket avec \`/ticket\``).setColor(C('#5865F2')).setThumbnail(member.user.displayAvatarURL({ dynamic: true })).addFields({ name: '👥 Membre', value: `#${member.guild.memberCount}`, inline: true }).setTimestamp()] });
    }
  }
  if (ROLE_MEMBER) {
    const role = member.guild.roles.cache.get(ROLE_MEMBER);
    if (role) member.roles.add(role).catch(() => {});
  }
});

client.on(Events.GuildMemberRemove, async member => {
  if (CH_BYE) {
    const ch = member.guild.channels.cache.get(CH_BYE);
    if (ch) ch.send({ embeds: [new EmbedBuilder().setDescription(`😢 **${member.user.username}** a quitté le serveur.`).setColor(C('#F04747')).setTimestamp()] });
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton()) {
    if (interaction.customId === 'open_ticket') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const r = await createTicket(interaction.guild, interaction.user);
        if (r.already) return interaction.editReply({ content: `❌ Ticket existant : <#${r.channel.id}>` });
        return interaction.editReply({ content: `✅ Ticket créé : <#${r.channel.id}>` });
      } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
    }
    if (interaction.customId === 'close_ticket') {
      if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ content: '❌ Pas un ticket.', ephemeral: true });
      await interaction.reply({ content: '🔒 Fermeture dans 5 secondes...' });
      await closeTicket(interaction.channel, interaction.user);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'ping') {
    const lat = Date.now() - interaction.createdTimestamp;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏓 Pong !').addFields({ name: '⚡ Latence', value: `${lat}ms`, inline: true }, { name: '💓 API', value: `${Math.round(client.ws.ping)}ms`, inline: true }).setColor(C('#23D18B'))] });
  }

  if (commandName === 'shop') {
    await interaction.deferReply();
    if (!shopProducts.length) await fetchProducts();
    return interaction.editReply({ embeds: [shopEmbed(shopProducts)] });
  }

  if (commandName === 'produit') {
    await interaction.deferReply();
    const nom = interaction.options.getString('nom').toLowerCase();
    if (!shopProducts.length) await fetchProducts();
    const p = shopProducts.find(x => (x.name || x.title || '').toLowerCase().includes(nom));
    if (!p) return interaction.editReply({ content: `❌ "${nom}" introuvable. Essayez \`/shop\`.` });
    return interaction.editReply({ embeds: [productEmbed(p)] });
  }

  if (commandName === 'regles') {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📜 Règles du Serveur').setColor(C('#E74C3C')).addFields(
      { name: '🤝 1. Respect', value: 'Aucune insulte, discrimination ou harcèlement envers les membres et le staff.' },
      { name: '🔇 2. Pas de spam', value: 'Ne spammez pas les channels. Pas de flood ni de répétitions.' },
      { name: '🚫 3. Contenu approprié', value: 'Pas de contenu NSFW, violent ou choquant hors des channels dédiés.' },
      { name: '📢 4. Pas de pub', value: 'Aucune publicité ou promotion sans autorisation préalable.' },
      { name: '💰 5. Pas d\'arnaque', value: 'Toute escroquerie = ban immédiat et définitif.' },
      { name: '🎫 6. Tickets', value: 'Pour tout problème, utilisez `/ticket`. Ne contactez pas le staff en DM.' },
      { name: '⚖️ 7. Décisions du staff', value: 'Les décisions sont finales. Contestez via ticket, pas en public.' },
    ).setTimestamp().setFooter({ text: 'Le non-respect entraîne des sanctions.' })] });
  }

  if (commandName === 'ticket') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const r = await createTicket(interaction.guild, interaction.user);
      if (r.already) return interaction.editReply({ content: `❌ Ticket existant : <#${r.channel.id}>` });
      return interaction.editReply({ content: `✅ Ticket créé : <#${r.channel.id}>` });
    } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
  }

  if (commandName === 'fermer') {
    if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ content: '❌ Pas dans un ticket.', ephemeral: true });
    await interaction.reply({ content: '🔒 Fermeture dans 5 secondes...' });
    return closeTicket(interaction.channel, interaction.user);
  }

  if (commandName === 'info') {
    const g = interaction.guild;
    await g.fetch();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`ℹ️ ${g.name}`).setThumbnail(g.iconURL({ dynamic: true })).setColor(C('#5865F2')).addFields({ name: '👥 Membres', value: `${g.memberCount}`, inline: true }, { name: '📅 Créé le', value: g.createdAt.toLocaleDateString('fr-FR'), inline: true }, { name: '🎭 Rôles', value: `${g.roles.cache.size}`, inline: true }, { name: '# Channels', value: `${g.channels.cache.size}`, inline: true }, { name: '🚀 Boosts', value: `${g.premiumSubscriptionCount || 0} (Niv. ${g.premiumTier})`, inline: true }).setTimestamp()] });
  }

  if (commandName === 'donner-role') {
    const m = interaction.options.getMember('membre');
    const r = interaction.options.getRole('role');
    try { await m.roles.add(r); return interaction.reply({ content: `✅ Rôle **${r.name}** donné à ${m}.`, ephemeral: true }); }
    catch (e) { return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true }); }
  }

  if (commandName === 'retirer-role') {
    const m = interaction.options.getMember('membre');
    const r = interaction.options.getRole('role');
    try { await m.roles.remove(r); return interaction.reply({ content: `✅ Rôle **${r.name}** retiré de ${m}.`, ephemeral: true }); }
    catch (e) { return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true }); }
  }

  if (commandName === 'clear') {
    const n = interaction.options.getInteger('nombre');
    try { const d = await interaction.channel.bulkDelete(n, true); return interaction.reply({ content: `✅ ${d.size} messages supprimés.`, ephemeral: true }); }
    catch (e) { return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true }); }
  }

  if (commandName === 'annonce') {
    const msg = interaction.options.getString('message');
    const target = interaction.options.getChannel('channel') || interaction.channel;
    await target.send({ embeds: [new EmbedBuilder().setTitle('📢 Annonce').setDescription(msg).setColor(C('#5865F2')).setTimestamp().setFooter({ text: `Par ${interaction.user.username}` })] });
    return interaction.reply({ content: `✅ Annonce envoyée dans ${target}.`, ephemeral: true });
  }

  if (commandName === 'commande') {
    await interaction.deferReply({ ephemeral: true });
    const email = interaction.options.getString('email');
    if (!SH_KEY) return interaction.editReply({ content: '❌ Clé Sellhub non configurée.' });
    try {
      const res = await fetch(`https://dash.sellhub.cx/api/sellhub/orders?email=${encodeURIComponent(email)}`, { headers: { Authorization: SH_KEY } });
      const data = await res.json();
      const orders = data.data || data.orders || [];
      if (!orders.length) return interaction.editReply({ content: `❌ Aucune commande pour **${email}**.` });
      const emb = new EmbedBuilder().setTitle(`📦 Commandes — ${email}`).setColor(C('#23D18B'));
      orders.slice(0, 5).forEach(o => emb.addFields({ name: o.product?.name || o.productName || '—', value: `${o.amount ? parseFloat(o.amount).toFixed(2) + '€' : '—'} • ${o.status || 'pending'}`, inline: false }));
      return interaction.editReply({ embeds: [emb] });
    } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
  }
});

// Commandes préfixe
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot || !msg.content.startsWith('!')) return;
  const [cmd] = msg.content.slice(1).split(' ');
  if (cmd === 'setup-tickets' && msg.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    const emb = new EmbedBuilder().setTitle('🎫 Centre de Support').setDescription('Cliquez sur le bouton pour ouvrir un ticket.\n\n📦 Commande\n🔧 Support\n❓ Question').setColor(C('#5865F2')).setTimestamp().setFooter({ text: 'NexusBot Support' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('🎫 Ouvrir un Ticket').setStyle(ButtonStyle.Primary));
    await msg.channel.send({ embeds: [emb], components: [row] });
    msg.delete().catch(() => {});
  }
});

// ─── WEBHOOK SERVER (Sellhub notifications) ─────────────────
function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/', (req, res) => res.json({ status: 'ok', bot: client.user?.tag || 'starting' }));

  app.post('/sellhub', async (req, res) => {
    res.status(200).json({ ok: true });
    const { event, data } = req.body || {};
    console.log('Sellhub webhook:', event);
    if ((event === 'order.created' || event === 'order.completed') && CH_SALES) {
      const guild = client.guilds.cache.get(GUILD_ID);
      const ch = guild?.channels.cache.get(CH_SALES);
      if (ch) {
        const order = data || {};
        const prod = order.product?.name || order.productName || 'Produit';
        const amt = order.amount != null ? parseFloat(order.amount).toFixed(2) + '€' : '—';
        const email = order.email || order.customerEmail || 'Anonyme';
        ch.send({ embeds: [new EmbedBuilder().setTitle('💰 Nouvelle Vente !').setColor(C('#23D18B')).addFields({ name: '📦 Produit', value: prod, inline: true }, { name: '💵 Montant', value: `**${amt}**`, inline: true }, { name: '📧 Client', value: email, inline: true }).setTimestamp().setFooter({ text: 'Sellhub' })] });
      }
      // Give VIP role if discord ID in order
      const discordId = order.discordId || order.discord_id;
      if (discordId && ROLE_VIP) {
        const guild = client.guilds.cache.get(GUILD_ID);
        const member = await guild?.members.fetch(discordId).catch(() => null);
        if (member) {
          const role = guild.roles.cache.get(ROLE_VIP);
          if (role) member.roles.add(role).catch(() => {});
        }
      }
    }
  });

  app.listen(PORT, () => console.log(`🌐 Serveur sur port ${PORT}`));
}

startServer();
client.login(TOKEN).catch(e => { console.error('❌ Login:', e.message); process.exit(1); });
