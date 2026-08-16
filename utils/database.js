const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.json');

function initDB() {
    if (!fs.existsSync(dbPath)) {
        const defaultDB = {
            panelConfig: {
                title: '🔐 Painel de Verificação - DEJA FORN',
                description: 'Clique no botão abaixo para se verificar e ter acesso completo ao servidor!',
                banner: null,
                color: '#a855f7'
            },
            verifiedRole: null,
            voiceChannel: null,
            verifiedMembers: [],
            panelMessages: []
        };
        fs.writeFileSync(dbPath, JSON.stringify(defaultDB, null, 2));
        console.log('✅ Banco de dados criado');
    }
}

function getDB() {
    initDB();
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveDB(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function getPanelConfig() { return getDB().panelConfig; }
function updatePanelConfig(config) {
    const db = getDB();
    db.panelConfig = { ...db.panelConfig, ...config };
    saveDB(db);
    return db.panelConfig;
}

function getVerifiedRole() { return getDB().verifiedRole; }
function setVerifiedRole(roleId) {
    const db = getDB();
    db.verifiedRole = roleId;
    saveDB(db);
    return roleId;
}

function addVerifiedMember(userId) {
    const db = getDB();
    if (!db.verifiedMembers.includes(userId)) {
        db.verifiedMembers.push(userId);
        saveDB(db);
        return true;
    }
    return false;
}

function isVerified(userId) { return getDB().verifiedMembers.includes(userId); }
function getVerifiedCount() { return getDB().verifiedMembers.length; }

function getVoiceChannel() { return getDB().voiceChannel; }
function setVoiceChannel(channelId) {
    const db = getDB();
    db.voiceChannel = channelId;
    saveDB(db);
    return channelId;
}

function addPanelMessage(channelId, messageId) {
    const db = getDB();
    db.panelMessages.push({ channelId, messageId, timestamp: Date.now() });
    saveDB(db);
}

module.exports = {
    initDB, getDB, saveDB,
    getPanelConfig, updatePanelConfig,
    getVerifiedRole, setVerifiedRole,
    addVerifiedMember, isVerified, getVerifiedCount,
    getVoiceChannel, setVoiceChannel,
    addPanelMessage
};
