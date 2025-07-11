const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

let io; // Instância do Socket.IO
const clients = {}; // Usaremos um objeto simples para armazenar as instâncias de Senders
let numClientsConfigured = 1; // Número de Senders configurados atualmente

// Função para emitir eventos de status para o frontend
function emitClientStatusUpdate(clientInfo) {
    console.log(`[Manager] Emitindo clientStatusUpdate para Sender ${clientInfo.id}, Status: ${clientInfo.status}`);

    const safeClientInfo = {
        id: clientInfo.id,
        name: clientInfo.name,
        status: clientInfo.status,
        qr: clientInfo.qr,
        sessionDir: clientInfo.sessionDir // Manter para depuração da sessão
    };

    if (io) {
        io.emit('clientStatusUpdate', safeClientInfo);
        // CRÍTICO: Re-emitir a lista de Senders prontos após CADA atualização de status.
        console.log(`[Manager] Disparando atualização de readyClientsForRoutine após status update do Sender ${clientInfo.id}.`);
        io.emit('readyClientsForRoutine', getReadyClientsSafe());
    }
}

// Inicializa o módulo com a instância do Socket.IO
function init(socketIoInstance) {
    io = socketIoInstance;
    console.log('[Manager] whatsappClientManager inicializado com Socket.IO.');
}

// Função para obter todos os Senders e seus status para o frontend
function getAllClientsStatus() {
    console.log('[Manager] getAllClientsStatus() chamado. Retornando status de todos os Senders.');
    return Object.values(clients).map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        qr: c.qr,
        sessionDir: c.sessionDir
    }));
}

// Função CRÍTICA: para obter apenas Senders com status 'Pronto' e 'isReady'
// Função CRÍTICA: para obter apenas Senders com status 'Pronto' (sem verificar wwebClient.isReady)
function getReadyClientsSafe() {
    console.log(`\n--- INÍCIO DE getReadyClientsSafe() (Simplificado) ---`);
    const allClientsArray = Object.values(clients);
    console.log(`[Manager - getReadyClientsSafe] Total de Senders no mapa 'clients': ${allClientsArray.length}`);

    const readyClients = allClientsArray.filter(c => {
        const clientId = c.id;
        const clientName = c.name;
        const clientInternalStatus = c.status;
        const hasWwebClientInstance = !!c.wwebClient;
        // Removendo a verificação de c.wwebClient.isReady, usando apenas o status interno
        const meetsCriteria = (clientInternalStatus === 'Pronto');

        console.log(`[Manager - getReadyClientsSafe] Avaliando Sender ${clientId} (${clientName}):`);
        console.log(`  - Status Interno ('c.status'): '${clientInternalStatus}' (Esperado 'Pronto')`);
        console.log(`  - Possui instância 'wwebClient': ${hasWwebClientInstance}`);
        console.log(`  - CRITÉRIO SIMPLIFICADO ('Pronto'): ${meetsCriteria}`); // Novo log
        return meetsCriteria;
    });

    console.log(`[Manager - getReadyClientsSafe] FINAL. Senders REALMENTE prontos encontrados: ${readyClients.length}`);
    readyClients.forEach(rc => console.log(`  -> Sender Pronto: ID ${rc.id}, Nome ${rc.name}`));
    console.log(`--- FIM DE getReadyClientsSafe() (Simplificado) ---\n`);

    return readyClients.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status // Manter status para depuração, será 'Pronto'
    }));
}

// Cria e inicializa um Sender WhatsApp
async function createAndInitializeClient(id) {
    const clientName = `WPP_Client_${id}`;
    const sessionDir = path.join(__dirname, 'sessions', `session-${id}`);

    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Se o Sender já está em processo de inicialização ou já pronto, não recria
    if (clients[id] && clients[id].wwebClient && ['Inicializando', 'QR_CODE', 'Autenticado', 'Pronto'].includes(clients[id].status)) {
        console.log(`[Manager] Sender ${id} já está em status funcional '${clients[id].status}', não reinicializando. Re-emitindo status.`);
        emitClientStatusUpdate(clients[id]);
        return;
    }

    // Se o Sender existe e não está em um estado "bom", destrói antes de recriar
    if (clients[id] && clients[id].wwebClient) {
        console.log(`[Manager] Destruindo Sender existente ${id} (status: ${clients[id].status}) para recriação limpa.`);
        try {
            await clients[id].wwebClient.destroy();
        } catch (e) {
            console.error(`[Manager] Erro ao destruir Sender ${id} antes de recriar:`, e);
        }
        delete clients[id];
    } else if (clients[id]) {
        console.log(`[Manager] Limpando entrada inconsistente para Sender ${id}.`);
        delete clients[id];
    }

    console.log(`[Manager] Criando e inicializando NOVO CLIENTE ${clientName} (ID: ${id})`);
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: id, dataPath: sessionDir }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
        }
    });

    clients[id] = {
        id: id,
        name: clientName,
        wwebClient: client, // Armazena a instância do client
        status: 'Inicializando',
        qr: null,
        sessionDir: sessionDir
    };
    emitClientStatusUpdate(clients[id]);

    client.on('qr', (qr) => {
        console.log(`[Client ${id}] Evento 'qr' recebido.`);
        if (clients[id]) {
            clients[id].status = 'QR_CODE';
            clients[id].qr = qr;
            emitClientStatusUpdate(clients[id]);
        }
    });

client.on('ready', () => {
        console.log(`[Client ${id}] Evento 'ready' DISPARADO!`);
        if (clients[id]) {
            clients[id].status = 'Pronto';
            clients[id].qr = null; // Limpa QR

            // Emite o status atualizado do Sender imediatamente. Isso chamará getReadyClientsSafe().
            emitClientStatusUpdate(clients[id]);

            // --- NOVO POLLING ROBUSTO PARA isReady ---
            let checkCount = 0;
            const maxChecks = 10; // Tentar 10 vezes
            const checkInterval = 1000; // A cada 1 segundo

            const readyCheckInterval = setInterval(() => {
                checkCount++;
                const currentIsReadyStatus = clients[id].wwebClient ? clients[id].wwebClient.isReady : 'N/A (wwebClient ausente)';
                console.log(`[Client ${id}] Polling isReady (Tentativa ${checkCount}/${maxChecks}): ${currentIsReadyStatus}`);

                if (currentIsReadyStatus === true) {
                    console.log(`[Client ${id}] wwebClient.isReady FINALMENTE TRUE após ${checkCount} tentativas!`);
                    clearInterval(readyCheckInterval); // Para o polling
                    if (io) {
                        console.log(`[Manager] Re-emitindo readyClientsForRoutine após wwebClient.isReady ser TRUE para Sender ${id}.`);
                        io.emit('readyClientsForRoutine', getReadyClientsSafe());
                    }
                } else if (checkCount >= maxChecks) {
                    console.warn(`[Client ${id}] wwebClient.isReady NÃO SE TORNOU TRUE após ${maxChecks} tentativas. Permanece: ${currentIsReadyStatus}`);
                    clearInterval(readyCheckInterval); // Para o polling
                    // Mesmo que não tenha ficado true, re-emitimos para garantir que o estado atual seja propagado
                    if (io) {
                        console.log(`[Manager] Re-emitindo readyClientsForRoutine após falha no polling de isReady para Sender ${id}.`);
                        io.emit('readyClientsForRoutine', getReadyClientsSafe());
                    }
                }
            }, checkInterval);
            // --- FIM DO POLLING ROBUSTO ---
        }
    });

    client.on('authenticated', () => {
        console.log(`[Client ${id}] Evento 'authenticated' recebido.`);
        if (clients[id]) {
            clients[id].status = 'Autenticado';
            emitClientStatusUpdate(clients[id]);
        }
    });

    client.on('auth_failure', msg => {
        console.error(`[Client ${id}] Falha na autenticação:`, msg);
        if (clients[id]) {
            clients[id].status = 'Falha na Autenticação';
            clients[id].qr = null;
            emitClientStatusUpdate(clients[id]);
        }
    });

    client.on('disconnected', async (reason) => {
        console.log(`[Client ${id}] DESCONECTADO:`, reason);
        if (clients[id]) {
            clients[id].status = 'Desconectado';
            clients[id].qr = null;
            emitClientStatusUpdate(clients[id]);

            console.log(`[Client ${id}] Tentando remover sessão antiga após desconexão.`);
            try {
                await fs.promises.rm(sessionDir, { recursive: true, force: true });
                console.log(`[Client ${id}] Pasta de sessão ${sessionDir} removida.`);
            } catch (err) {
                console.error(`[Client ${id}] Erro ao remover pasta de sessão ${sessionDir}:`, err);
            }
        }
    });

    client.on('change_state', state => {
        console.log(`[Client ${id}] Estado interno do wwebClient mudou para:`, state);
    });

    client.on('message', message => {
        // console.log(`[Client ${id}] Mensagem recebida:`, message.body);
    });

    try {
        await client.initialize();
        console.log(`[Client ${id}] Chamada de client.initialize() concluída.`);
    } catch (err) {
        console.error(`[Client ${id}] ERRO FATAL ao inicializar o wwebClient:`, err);
        if (clients[id]) {
            clients[id].status = 'Erro de Inicialização';
            clients[id].qr = null;
            emitClientStatusUpdate(clients[id]);
        }
    }
}

// Função para gerenciar o número de Senders ativos (chamada do app.js)
async function initializeClients(newNumClients) {
    console.log(`[Manager] Gerenciando Senders: configurados ${numClientsConfigured}, novos ${newNumClients}`);

    // Destrói Senders extras se o número for reduzido
    if (newNumClients < numClientsConfigured) {
        for (let i = newNumClients + 1; i <= numClientsConfigured; i++) {
            if (clients[i] && clients[i].wwebClient) {
                console.log(`[Manager] Destruindo Sender ${i} pois o NUM_CLIENTS foi reduzido.`);
                try {
                    await clients[i].wwebClient.destroy();
                } catch (e) {
                    console.error(`[Manager] Erro ao destruir Sender ${i}:`, e);
                }
                emitClientStatusUpdate({ id: i, name: `WPP_Client_${i}`, status: 'Removido', qr: null, sessionDir: '' });
                delete clients[i]; // Remove a referência
                const sessionPath = path.join(__dirname, 'sessions', `session-${i}`);
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    console.log(`[Manager] Pasta de sessão ${sessionPath} removida.`);
                }
            }
        }
    }

    // Cria ou garante que os Senders necessários estão inicializados
    for (let i = 1; i <= newNumClients; i++) {
        await createAndInitializeClient(i); // Garante que cada Sender seja inicializado em sequência
    }

    numClientsConfigured = newNumClients; // Atualiza o número de Senders configurado
    // Emite a lista de Senders prontos após o gerenciamento inicial.
    if (io) {
        console.log("[Manager] Re-emitindo readyClientsForRoutine após o ciclo initializeClients.");
        io.emit('readyClientsForRoutine', getReadyClientsSafe());
    }
}

// Reautenticar um Sender existente
async function reauthenticateClient(clientId) {
    console.log(`[Manager] Solicitando reautenticação para Sender ${clientId}.`);

    // Destrói e remove a sessão para garantir uma nova autenticação limpa
    if (clients[clientId] && clients[clientId].wwebClient) {
        console.log(`[Manager] Destruindo Sender ${clientId} para reautenticação forçada.`);
        try {
            await clients[clientId].wwebClient.destroy();
        } catch (e) {
            console.error(`[Manager] Erro ao destruir Sender ${clientId} para reautenticação:`, e);
        }
    }
    delete clients[clientId]; // Remove do mapa para ser recriado limpo

    const sessionPath = path.join(__dirname, 'sessions', `session-${clientId}`);
    if (fs.existsSync(sessionPath)) {
        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`[Manager] Pasta de sessão ${sessionPath} removida para reautenticação.`);
        } catch (e) {
            console.error(`[Manager] Erro ao remover pasta de sessão ${sessionPath}:`, e);
        }
    }

    // Inicia o processo de criação e inicialização
    await createAndInitializeClient(clientId);
    return { success: true, message: `Reautenticação do Sender ${clientId} iniciada. Verifique o console para QR Code.` };
}

// Dentro de sendMessage(clientId, number, message)
// Dentro de sendMessage(clientId, number, message)
async function sendMessage(clientId, number, message) {
    const clientData = clients[clientId];

    // Adicione a validação de número de telefone aqui
    // Uma regex básica para validar números de WhatsApp (apenas dígitos, mínimo 6, máximo 15)
    // ATENÇÃO: Esta é uma validação SIMPLES. Para produção, considere bibliotecas de validação de telefone (ex: libphonenumber-js).
    const phoneNumberRegex = /^\d{6,15}$/; 
    if (!phoneNumberRegex.test(number)) {
        console.error(`[Manager] sendMessage: Número de telefone inválido para Sender ${clientId}: ${number}`);
        return { success: false, message: `Número de telefone inválido: ${number}.` };
    }

    if (!clientData || !clientData.wwebClient || clientData.status !== 'Pronto') {
        console.error(`[Manager] sendMessage: Sender ${clientId} não está pronto para enviar mensagens. Status: ${clientData ? clientData.status : 'N/A'}`);
        return { success: false, message: `Sender ${clientId} não está pronto para enviar mensagens. Status: ${clientData ? clientData.status : 'N/A'}` };
    }

    try {
        console.log(`[Manager] Tentando enviar mensagem via Sender ${clientId} para ${number}...`);
        const messagePromise = clientData.wwebClient.sendMessage(`${number}@c.us`, message);
        const timeoutPromise = new Promise((resolve, reject) =>
            setTimeout(() => reject(new Error('Tempo limite de envio de mensagem excedido.')), 60000) // 60 segundos
        );

        await Promise.race([messagePromise, timeoutPromise]);

        return { success: true, message: `Mensagem enviada com sucesso para ${number}.` };
    } catch (error) {
        // O erro do whatsapp-web.js pode não ser tão descritivo para "número inválido"
        // mas capturará outros erros de envio como desconexão, etc.
        console.error(`[Manager] Erro ao enviar mensagem via Sender ${clientId} para ${number}:`, error);
        return { success: false, message: `Falha ao enviar mensagem: ${error.message}` };
    }
}

module.exports = {
    init,
    initializeClients,
    getAllClientsStatus,
    getReadyClients: getReadyClientsSafe,
    reauthenticateClient,
    sendMessage
};