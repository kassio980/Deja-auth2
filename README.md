# 🪐 DEJA FORN - Bot de Verificação Discord v2.0

Bot completo e funcional de verificação Discord com OAuth2.

## ✨ Principais Funcionalidades

### 📊 Comando `/painel`
- **Membros Totais**: Quantidade real de membros
- **Membros Online**: Contagem REAL (busca todos os membros do servidor)
- **Membros Verificados**: Contador atualizado

### ⚙️ 5 Botões Administrativos
1. **⚙️ Configurar Painel** - Edita título, descrição, banner/GIF e cor
2. **👥 Resgatar Membros** - Traz membros de outro servidor
3. **📤 Enviar Painel** - Envia painel com botão que abre DIRETAMENTE OAuth2 oficial
4. **🔊 Conectar Voz** - Configura canal de voz permanente
5. **🎖️ Configurar Cargo** - Define cargo automático pós-verificação

### 🔐 Sistema de Verificação
- ✅ Botão **VERIFICA-SE** abre **diretamente a janela oficial do Discord OAuth2**
- ✅ Site com barra de progresso animada (4 etapas)
- ✅ Cargo adicionado automaticamente
- ✅ Imagem de fundo personalizada

## 🚀 Deploy no Render

### Variáveis de Ambiente:
```env
BOT_TOKEN=seu_token
CLIENT_ID=seu_client_id
CLIENT_SECRET=seu_secret
GUILD_ID=id_do_servidor
REDIRECT_URI=https://deja-auth2-com.onrender.com/callback
SITE_URL=https://deja-auth2-com.onrender.com
PORT=3000
```

### Discord Developers:
- Redirect URI: `https://deja-auth2-com.onrender.com/callback`
- Intents: Presence, Server Members, Message Content

## 📝 Como usar

1. Digite `/painel` no Discord
2. Clique em **🎖️ Configurar Cargo** → Cole o ID do cargo
3. Clique em **⚙️ Configurar Painel** → Personalize
4. Clique em **📤 Enviar Painel** → Cole o ID do canal
5. Pronto! Usuários clicam em 🪐 **VERIFICA-SE** e são verificados

## 📁 Estrutura
```
├── index.js              # Bot + Servidor Express
├── package.json          # Dependências
├── render.yaml           # Configuração Render
├── config/index.js       # Configurações
├── utils/database.js     # Banco de dados JSON
└── public/
    ├── verify.html       # Site de verificação
    └── fundo.png         # Imagem de fundo
```
