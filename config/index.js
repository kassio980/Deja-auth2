require('dotenv').config();

module.exports = {
    token: process.env.BOT_TOKEN,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    guildId: process.env.GUILD_ID,
    redirectUri: process.env.REDIRECT_URI,
    port: process.env.PORT || 3000,
    siteUrl: process.env.SITE_URL,
    
    // Cores do tema
    colors: {
        neonPurple: '#a855f7',
        darkBlue: '#0f0f23',
        neonPurpleLight: '#c084fc'
    },
    
    // Escopos OAuth2
    scopes: ['identify', 'guilds.join', 'email'],
    
    // Painel padrão
    defaultPanel: {
        title: '🔐 Painel de Verificação - DEJA FORN',
        description: 'Clique no botão abaixo para se verificar e ter acesso completo ao servidor!',
        banner: null,
        color: '#a855f7'
    }
};
