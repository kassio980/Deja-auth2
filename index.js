require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField, REST, Routes } = require('discord.js');
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const db = require('./utils/database');

// Inicializa banco de dados
db.initDB();

// ═══════════════════════════════════════════
// CLIENTE DISCORD
// ═══════════════════════════════════════════
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember]
});

// ═══════════════════════════════════════════
// SERVIDOR EXPRESS (SITE DE VERIFICAÇÃO)
// ═══════════════════════════════════════════
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'deja-forn-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 86400000 }
}));

// Servir arquivos estáticos (CSS, JS, IMAGENS)
app.use(express.static(path.join(__dirname, 'public')));

// Log de requisições
app.use((req, res, next) => {
    console.log(`🌐 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// ───────────────────────────────────────────
// ROTAS DO SITE
// ───────────────────────────────────────────

// Página de verificação
app.get('/verify', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

// Callback OAuth2 do Discord
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    
    if (!code) {
        console.log('❌ Callback sem código');
        return res.redirect('/verify?error=no_code');
    }

    try {
        console.log('🔄 Trocando código por token...');
        
        // Troca código por access token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: config.redirectUri,
                scope: config.scopes.join(' ')
            }),
            { 
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 15000
            }
        );

        const accessToken = tokenResponse.data.access_token;
        console.log('✅ Token obtido');

        // Pega dados do usuário
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000
        });

        const user = userResponse.data;
        console.log(`👤 Usuário: ${user.username}#${user.discriminator} (${user.id})`);

        // Armazena na sessão
        req.session.user = user;
        req.session.accessToken = accessToken;

        // Tenta adicionar o usuário ao servidor
        try {
            const guild = client.guilds.cache.get(config.guildId);
            if (guild) {
                await guild.members.add(user.id, { accessToken })
                    .then(() => console.log(`✅ ${user.username} adicionado ao servidor`))
                    .catch(e => console.log(`ℹ️ ${user.username} já está no servidor: ${e.message}`));
            }
        } catch (e) {
            console.log('⚠️ Erro ao adicionar membro (provavelmente já está):', e.message);
        }

        // Redireciona para página de verificação
        res.redirect(`/verify?userId=${user.id}&username=${encodeURIComponent(user.username)}`);

    } catch (error) {
        console.error('❌ Erro no callback OAuth2:', error.response?.data || error.message);
        res.redirect('/verify?error=oauth_failed');
    }
});

// API: Completar verificação e dar cargo
app.post('/api/complete-verification', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.json({ success: false, error: 'ID do usuário não fornecido' });
    }

    try {
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) {
            return res.json({ success: false, error: 'Servidor não encontrado' });
        }

        // Busca o membro no servidor (força o fetch para garantir)
        const member = await guild.members.fetch(userId).catch(() => null);
        
        if (!member) {
            return res.json({ success: false, error: 'Membro não encontrado no servidor' });
        }

        // Adiciona o cargo verificado
        const roleId = db.getVerifiedRole();
        if (roleId) {
            const role = guild.roles.cache.get(roleId);
            if (role) {
                await member.roles.add(roleId)
                    .then(() => console.log(`🎖️ Cargo dado a ${member.user.username}`))
                    .catch(e => console.error(`❌ Erro ao dar cargo: ${e.message}`));
            } else {
                console.log('⚠️ Cargo verificado não encontrado no cache');
            }
        } else {
            console.log('⚠️ Nenhum cargo verificado configurado');
        }

        // Registra como verificado no banco
        const isNew = db.addVerifiedMember(userId);
        console.log(`✅ ${member.user.username} verificado com sucesso! (${isNew ? 'Novo' : 'Já era verificado'})`);

        res.json({ success: true, message: 'Verificação concluída!' });

    } catch (error) {
        console.error('❌ Erro ao completar verificação:', error);
        res.json({ success: false, error: error.message });
    }
});

// API: Status do bot
app.get('/api/status', (req, res) => {
    res.json({
        online: client.isReady(),
        botTag: client.user?.tag || null,
        verifiedCount: db.getVerifiedCount(),
        siteUrl: config.siteUrl
    });
});

// ═══════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════

// Gera URL de autorização OAuth2
function gerarUrlAuth() {
    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: config.scopes.join(' ')
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

// Conta membros ONLINE REAIS
async function contarMembrosOnline(guild) {
    try {
        // Força o fetch de todos os membros para ter dados atualizados
        await guild.members.fetch({ force: true });
        
        // Conta membros que NÃO estão offline e NÃO são bots
        const online = guild.members.cache.filter(m => {
            if (m.user.bot) return false;
            const presence = m.presence;
            return presence && presence.status !== 'offline';
        });

        return online.size;
    } catch (error) {
        console.error('❌ Erro ao contar membros online:', error);
        return 0;
    }
}

// Cria o painel administrativo
async function criarPainelAdmin(interaction) {
    const guild = interaction.guild;
    
    // Busca dados REAIS
    const totalMembers = guild.memberCount;
    const onlineMembers = await contarMembrosOnline(guild);
    const verifiedCount = db.getVerifiedCount();
    const panelConfig = db.getPanelConfig();
    const roleId = db.getVerifiedRole();
    const voiceId = db.getVoiceChannel();

    const embed = new EmbedBuilder()
        .setColor(panelConfig.color || config.colors.neonPurple)
        .setTitle('📊 Painel de Controle - DEJA FORN')
        .setDescription('**Gerencie todas as configurações do sistema de verificação**')
        .addFields(
            { 
                name: '👥 Membros Totais', 
                value: `\`${totalMembers.toLocaleString('pt-BR')}\``, 
                inline: true 
            },
            { 
                name: '🟢 Membros Online', 
                value: `\`${onlineMembers.toLocaleString('pt-BR')}\``, 
                inline: true 
            },
            { 
                name: '✅ Verificados', 
                value: `\`${verifiedCount.toLocaleString('pt-BR')}\``, 
                inline: true 
            },
            { 
                name: '⚙️ Configurações Atuais', 
                value: `🎖️ Cargo: ${roleId ? `<@&${roleId}>` : '`Não configurado`'}\n🔊 Voz: ${voiceId ? `<#${voiceId}>` : '`Não configurado`'}`, 
                inline: false 
            }
        )
        .setFooter({ text: 'DEJA FORN - Sistema de Verificação', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

    // Se tiver banner configurado, adiciona
    if (panelConfig.banner && panelConfig.banner.startsWith('http')) {
        embed.setImage(panelConfig.banner);
    }

    // Botões organizados em fileiras
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('configurar_painel')
                .setLabel('⚙️ Configurar Painel')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('resgatar_membros')
                .setLabel('👥 Resgatar Membros')
                .setStyle(ButtonStyle.Success)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('enviar_painel')
                .setLabel('📤 Enviar Painel')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('conectar_voz')
                .setLabel('🔊 Conectar Voz')
                .setStyle(ButtonStyle.Primary)
        );

    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('configurar_cargo')
                .setLabel('🎖️ Configurar Cargo')
                .setStyle(ButtonStyle.Danger)
        );

    return { embeds: [embed], components: [row1, row2, row3] };
}

// ═══════════════════════════════════════════
// EVENTOS DO BOT
// ═══════════════════════════════════════════

client.on('ready', async () => {
    console.log('\n' + '═'.repeat(60));
    console.log(`✅ BOT CONECTADO: ${client.user.tag}`);
    console.log(`🆔 ID: ${client.user.id}`);
    console.log(`🏰 Servidores: ${client.guilds.cache.size}`);
    console.log(`🌐 Site: ${config.siteUrl}`);
    console.log('═'.repeat(60) + '\n');

    // Atualiza status do bot
    client.user.setActivity('DEJA FORN - /painel', { type: 3 });

    // Cacheia membros do servidor principal
    const guild = client.guilds.cache.get(config.guildId);
    if (guild) {
        try {
            await guild.members.fetch();
            console.log(`✅ Membros cacheados: ${guild.members.cache.size}`);
        } catch (e) {
            console.log('⚠️ Não foi possível cachear membros:', e.message);
        }
    }
});

// ───────────────────────────────────────────
// INTERAÇÕES (COMANDOS, BOTÕES, MODAIS)
// ───────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
    try {
        // ═══════════════════════════════════════
        // COMANDO /painel
        // ═══════════════════════════════════════
        if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ 
                    content: '❌ Você precisa ser **Administrador** para usar este comando!', 
                    ephemeral: true 
                });
            }

            await interaction.deferReply({ ephemeral: true });
            const painel = await criarPainelAdmin(interaction);
            await interaction.editReply(painel);
            return;
        }

        // ═══════════════════════════════════════
        // BOTÃO: CONFIGURAR PAINEL
        // ═══════════════════════════════════════
        if (interaction.isButton() && interaction.customId === 'configurar_painel') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ Sem permissão!', ephemeral: true });
            }

            const cfg = db.getPanelConfig();

            const modal = new ModalBuilder()
                .setCustomId('modal_painel')
                .setTitle('⚙️ Configurar Painel');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('titulo')
                        .setLabel('Título do Painel')
                        .setStyle(TextInputStyle.Short)
                        .setValue(cfg.title)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('descricao')
                        .setLabel('Descrição')
                        .setStyle(TextInputStyle.Paragraph)
                        .setValue(cfg.description)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('banner')
                        .setLabel('URL do Banner/GIF (opcional)')
                        .setStyle(TextInputStyle.Short)
                        .setValue(cfg.banner || '')
                        .setRequired(false)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('cor')
                        .setLabel('Cor (HEX)')
                        .setStyle(TextInputStyle.Short)
                        .setValue(cfg.color || '#a855f7')
                        .setRequired(false)
                )
            );

            await interaction.showModal(modal);
            return;
        }

        // ═══════════════════════════════════════
        // MODAL: SALVAR PAINEL
        // ═══════════════════════════════════════
        if (interaction.isModalSubmit() && interaction.customId === 'modal_painel') {
            const titulo = interaction.fields.getTextInputValue('titulo');
            const descricao = interaction.fields.getTextInputValue('descricao');
            const banner = interaction.fields.getTextInputValue('banner')?.trim() || null;
            const cor = interaction.fields.getTextInputValue('cor')?.trim() || '#a855f7';

            db.updatePanelConfig({ 
                title: titulo, 
                description: descricao, 
                banner: banner, 
                color: cor 
            });

            console.log('✅ Painel atualizado:', { titulo, banner, cor });

            await interaction.deferUpdate({ ephemeral: true });
            const painel = await criarPainelAdmin(interaction);
            await interaction.editReply(painel);
            await interaction.followUp({ 
                content: '✅ **Painel configurado e salvo com sucesso!**', 
                ephemeral: true 
            });
            return;
        }

        // ═══════════════════════════════════════
        // BOTÃO: RESGATAR MEMBROS
        // ═══════════════════════════════════════
        if (interaction.isButton() && interaction.customId === 'resgatar_membros') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ Sem permissão!', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('modal_resgatar')
                .setTitle('👥 Resgatar Membros');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('servidor_id')
                        .setLabel('ID do Servidor Alvo')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Cole o ID do servidor')
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('quantidade')
                        .setLabel('Quantidade de Membros')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Ex: 50 (até 100 = 3 min)')
                        .setRequired(true)
                )
            );

            await interaction.showModal(modal);
            return;
        }

        // ═══════════════════════════════════════
        // MODAL: PROCESSAR RESGATE
        // ═══════════════════════════════════════
        if (interaction.isModalSubmit() && interaction.customId === 'modal_resgatar') {
            const servidorId = interaction.fields.getTextInputValue('servidor_id').trim();
            const quantidade = parseInt(interaction.fields.getTextInputValue('quantidade'));

            if (isNaN(quantidade) || quantidade < 1) {
                return interaction.reply({ content: '❌ Quantidade inválida!', ephemeral: true });
            }

            const guildAlvo = client.guilds.cache.get(servidorId);
            if (!guildAlvo) {
                const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&permissions=8&scope=bot%20applications.commands%20guilds.join&guild_id=${servidorId}`;
                return interaction.reply({ 
                    content: `❌ O bot não está no servidor alvo!\n\nAdicione ele primeiro:\n${inviteUrl}`, 
                    ephemeral: true 
                });
            }

            await interaction.reply({ 
                content: `✅ **Resgate iniciado!**\n\n📥 Servidor: **${guildAlvo.name}**\n👥 Quantidade: **${quantidade}** membros\n⏱️ Tempo estimado: ${Math.ceil(quantidade / 100) * 3} minutos\n\nOs membros começarão a entrar em breve...`, 
                ephemeral: true 
            });

            // Processa em background
            processarResgate(interaction, guildAlvo, quantidade);
            return;
        }

        // ═══════════════════════════════════════
        // BOTÃO: ENVIAR PAINEL PARA CANAL
        // ═══════════════════════════════════════
        if (interaction.isButton() && interaction.customId === 'enviar_painel') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ Sem permissão!', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('modal_enviar')
                .setTitle('📤 Enviar Painel');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('canal_id')
                        .setLabel('ID do Canal de Texto')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Cole o ID do canal')
                        .setRequired(true)
                )
            );

            await interaction.showModal(modal);
            return;
        }

        // ═══════════════════════════════════════
        // MODAL: ENVIAR PAINEL
        // ═══════════════════════════════════════
        if (interaction.isModalSubmit() && interaction.customId === 'modal_enviar') {
            const canalId = interaction.fields.getTextInputValue('canal_id').trim();
            const canal = interaction.guild.channels.cache.get(canalId);

            if (!canal || canal.type !== ChannelType.GuildText) {
                return interaction.reply({ 
                    content: '❌ Canal inválido! Certifique-se que é um canal de texto.', 
                    ephemeral: true 
                });
            }

            const panelConfig = db.getPanelConfig();
            const authUrl = gerarUrlAuth();

            // Cria EMBED do painel público
            const embed = new EmbedBuilder()
                .setColor(panelConfig.color || config.colors.neonPurple)
                .setTitle(panelConfig.title)
                .setDescription(panelConfig.description)
                .setFooter({ text: 'DEJA FORN - Verificação Segura', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            // Adiciona banner se existir
            if (panelConfig.banner && panelConfig.banner.startsWith('http')) {
                embed.setImage(panelConfig.banner);
                console.log('🖼️ Banner aplicado:', panelConfig.banner);
            }

            // ───────────────────────────────────
            // ✅ CORREÇÃO IMPORTANTE:
            // Botão usa ButtonStyle.LINK = abre DIRETAMENTE a janela OAuth2 oficial
            // Não envia mensagem intermediária!
            // ───────────────────────────────────
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('VERIFICA-SE')
                        .setStyle(ButtonStyle.Link)
                        .setURL(authUrl)
                        .setEmoji('🪐')
                );

            try {
                const mensagem = await canal.send({ embeds: [embed], components: [row] });
                db.addPanelMessage(canalId, mensagem.id);

                console.log(`📤 Painel enviado para #${canal.name}`);

                await interaction.reply({ 
                    content: `✅ **Painel enviado com sucesso!**\n\n📢 Canal: ${canal}\n🔗 [Ver mensagem](${mensagem.url})`, 
                    ephemeral: true 
                });

                // Atualiza o painel admin
                await interaction.message.edit(await criarPainelAdmin(interaction)).catch(() => {});

            } catch (error) {
                console.error('❌ Erro ao enviar painel:', error);
                await interaction.reply({ 
                    content: `❌ Erro: ${error.message}`, 
                    ephemeral: true 
                });
            }
            return;
        }

        // ═══════════════════════════════════════
        // BOTÃO: CONECTAR VOZ
        // ═══════════════════════════════════════
        if (interaction.isButton() && interaction.customId === 'conectar_voz') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ Sem permissão!', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('modal_voz')
                .setTitle('🔊 Canal de Voz');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('canal_voz_id')
                        .setLabel('ID do Canal de Voz')
                        .setStyle(TextInputStyle.Short)
                        .setValue(db.getVoiceChannel() || '')
                        .setRequired(true)
                )
            );

            await interaction.showModal(modal);
            return;
        }

        // ═══════════════════════════════════════
        // MODAL: SALVAR CANAL DE VOZ
        // ═══════════════════════════════════════
        if (interaction.isModalSubmit() && interaction.customId === 'modal_voz') {
            const canalId = interaction.fields.getTextInputValue('canal_voz_id').trim();
            const canal = interaction.guild.channels.cache.get(canalId);

            if (!canal || canal.type !== ChannelType.GuildVoice) {
                return interaction.reply({ content: '❌ Canal de voz inválido!', ephemeral: true });
            }

            db.setVoiceChannel(canalId);

            await interaction.deferUpdate({ ephemeral: true });
            await interaction.editReply(await criarPainelAdmin(interaction));
            await interaction.followUp({ 
                content: `✅ **Canal de voz configurado:** ${canal}\n\n*Para conectar, instale: npm install @discordjs/voice*`, 
                ephemeral: true 
            });
            return;
        }

        // ═══════════════════════════════════════
        // BOTÃO: CONFIGURAR CARGO
        // ═══════════════════════════════════════
        if (interaction.isButton() && interaction.customId === 'configurar_cargo') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ Sem permissão!', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('modal_cargo')
                .setTitle('🎖️ Cargo Verificado');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('cargo_id')
                        .setLabel('ID do Cargo')
                        .setStyle(TextInputStyle.Short)
                        .setValue(db.getVerifiedRole() || '')
                        .setRequired(true)
                )
            );

            await interaction.showModal(modal);
            return;
        }

        // ═══════════════════════════════════════
        // MODAL: SALVAR CARGO
        // ═══════════════════════════════════════
        if (interaction.isModalSubmit() && interaction.customId === 'modal_cargo') {
            const cargoId = interaction.fields.getTextInputValue('cargo_id').trim();
            const cargo = interaction.guild.roles.cache.get(cargoId);

            if (!cargo) {
                return interaction.reply({ content: '❌ Cargo inválido!', ephemeral: true });
            }

            db.setVerifiedRole(cargoId);

            await interaction.deferUpdate({ ephemeral: true });
            await interaction.editReply(await criarPainelAdmin(interaction));
            await interaction.followUp({ 
                content: `✅ **Cargo verificado configurado:** ${cargo}`, 
                ephemeral: true 
            });
            return;
        }

    } catch (error) {
        console.error('❌ ERRO NA INTERAÇÃO:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: `❌ Erro: ${error.message}`, 
                ephemeral: true 
            }).catch(() => {});
        }
    }
});

// ═══════════════════════════════════════════
// FUNÇÃO: RESGATE DE MEMBROS
// ═══════════════════════════════════════════

async function processarResgate(interaction, guildAlvo, quantidade) {
    try {
        const guildPrincipal = client.guilds.cache.get(config.guildId);
        if (!guildPrincipal) return;

        console.log(`\n📥 INICIANDO RESGATE: ${quantidade} membros de ${guildAlvo.name}`);

        // Fetch de membros do servidor alvo
        await guildAlvo.members.fetch({ force: true });
        const membrosAlvo = guildAlvo.members.cache
            .filter(m => !m.user.bot)
            .first(quantidade);

        console.log(`📋 ${membrosAlvo.length} membros selecionados`);

        // Intervalo: 100 membros = 3 minutos = 1800ms cada
        const intervalo = Math.max(1800, Math.ceil(180000 / Math.max(quantidade, 1)));
        let sucessos = 0;
        let contador = 0;

        for (const membro of membrosAlvo.values()) {
            contador++;
            try {
                const jaEsta = guildPrincipal.members.cache.has(membro.id);
                
                if (!jaEsta) {
                    await guildPrincipal.members.add(membro.id)
                        .then(() => { sucessos++; })
                        .catch(() => {});
                } else {
                    sucessos++;
                }

                console.log(`✅ [${contador}/${membrosAlvo.length}] ${membro.user.tag}`);

            } catch (e) {
                console.log(`❌ [${contador}/${membrosAlvo.length}] Erro: ${e.message}`);
            }

            if (contador < membrosAlvo.length) {
                await new Promise(r => setTimeout(r, intervalo));
            }
        }

        console.log(`\n✅ RESGATE CONCLUÍDO: ${sucessos}/${membrosAlvo.length}\n`);

        await interaction.followUp({ 
            content: `✅ **Resgate concluído!**\n\n📥 **${sucessos}** de **${membrosAlvo.length}** membros processados\n🏰 Servidor: **${guildAlvo.name}**`, 
            ephemeral: true 
        }).catch(() => {});

    } catch (error) {
        console.error('❌ Erro no resgate:', error);
    }
}

// ═══════════════════════════════════════════
// REGISTRAR COMANDOS SLASH
// ═══════════════════════════════════════════

async function registrarComandos() {
    try {
        console.log('🔄 Registrando comandos slash...');
        
        const rest = new REST({ version: '10' }).setToken(config.token);
        
        const commands = [
            {
                name: 'painel',
                description: '📊 Painel de controle do sistema de verificação',
                default_member_permissions: '8'
            }
        ];

        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );
        
        console.log('✅ Comandos registrados!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error.message);
    }
}

// ═══════════════════════════════════════════
// INICIAR TUDO
// ═══════════════════════════════════════════

async function iniciar() {
    console.log('\n🚀 INICIANDO DEJA FORN BOT...\n');
    
    // Valida configurações
    if (!config.token) return console.error('❌ BOT_TOKEN não configurado!');
    if (!config.clientId) return console.error('❌ CLIENT_ID não configurado!');
    if (!config.clientSecret) return console.error('❌ CLIENT_SECRET não configurado!');
    if (!config.guildId) return console.error('❌ GUILD_ID não configurado!');
    if (!config.redirectUri) return console.error('❌ REDIRECT_URI não configurado!');
    if (!config.siteUrl) return console.error('❌ SITE_URL não configurado!');

    console.log('✅ Configurações validadas');
    
    await registrarComandos();
    await client.login(config.token);
    
    app.listen(config.port, () => {
        console.log(`\n🌐 Servidor web: porta ${config.port}`);
        console.log(`🔗 Callback: ${config.redirectUri}`);
        console.log(`📄 Verificação: ${config.siteUrl}/verify`);
        console.log(`🖼️  Imagem de fundo: ${config.siteUrl}/fundo.png`);
        console.log('\n' + '═'.repeat(60));
        console.log('  DEJA FORN - SISTEMA ONLINE!');
        console.log('═'.repeat(60) + '\n');
    });
}

iniciar().catch(console.error);
