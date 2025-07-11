// routineManager.js
import fs from 'fs';
import path from 'path';
// Não precisamos importar whatsappClientManager aqui, pois main.js gerencia as instâncias.
// Se você tiver outras funções em whatsappClientManager.js que são independentes e que este módulo precise,
// você as importaria aqui. Para as finalidades atuais, main.js é o orquestrador.

let io; // Instância do Socket.IO

// Inicializa o módulo com a instância do Socket.IO
export function init(socketIoInstance) {
    io = socketIoInstance;
    ensureLogsDirectoryExists(); // Garante que o diretório de logs exista
}

// Garante que o diretório 'logs' exista
function ensureLogsDirectoryExists() {
    const logDir = path.join(process.cwd(), 'logs'); // Usar process.cwd() para caminho relativo à raiz do projeto
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
        console.log(`[RoutineManager] Diretório de logs criado: ${logDir}`);
    }
}

/**
 * Salva o log completo de uma rotina finalizada.
 * Esta função é chamada pelo main.js ao finalizar ou parar uma rotina.
 * @param {object} config Configuração da rotina.
 * @param {Array} results Resultados detalhados de cada envio. (OBS: main.js não preenche mais isso aqui)
 * @param {Array} logs Entradas de log durante a execução da rotina.
 */
export function saveRoutineLog(config, results, logs) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
    const logFileName = `disparo_mensagens_${timestamp}.log`;
    const logFilePath = path.join(process.cwd(), 'logs', logFileName); // Usar process.cwd()

    let logContent = `============= LOG DE ROTINA DE ENVIO DE MENSAGENS =============\n`;
    logContent += `Data/Hora de Conclusão: ${now.toLocaleString()}\n\n`;

    logContent += `--- Configurações da Rotina ---\n`;
    logContent += `Mensagem: "${config.message}"\n`;
    logContent += `Tempo Mínimo (ms): ${config.minTime}\n`;
    logContent += `Tempo Máximo (ms): ${config.maxTime}\n`;
    logContent += `Total de Contatos na Lista: ${config.contacts ? config.contacts.length : 0}\n`;
    if (config.readyClientsUsed) {
        logContent += `Senders WhatsApp Usados (IDs): ${config.readyClientsUsed.map(c => c.id).join(', ')}\n`;
    }
    if (config.selectedClientId) {
        logContent += `Sender WhatsApp Selecionado: ${config.selectedClientId}\n`;
    }
    logContent += `\n`;

    // Os resultados detalhados por envio agora são controlados e logados via main.js
    // Este `results` aqui pode vir vazio do main.js
    if (results && results.length > 0) {
        logContent += `--- Resultados dos Envios (${results.length} tentativas) ---\n`;
        results.forEach(res => {
            logContent += `  Contato: ${res.contact.nome} (${res.contact.telefone})\n`;
            logContent += `  Status: ${res.success ? 'SUCESSO' : 'FALHA'}\n`;
            logContent += `  Sender Remetente: Sender ${res.clientId} (${res.clientName})\n`;
            logContent += `  Mensagem: "${res.messageSent}"\n`;
            logContent += `  Timestamp Envio: ${new Date(res.timestamp).toLocaleString()}\n`;
            if (!res.success) {
                logContent += `  Erro: ${res.error}\n`;
            }
            logContent += `  --------------------------\n`;
        });
        logContent += `\n`;
    } else {
        logContent += `--- Resultados Detalhados dos Envios (disponíveis nos logs principais da rotina) ---\n\n`;
    }

    logContent += `--- Logs Internos da Rotina ---\n`;
    logs.forEach(log => {
        logContent += `${log}\n`;
    });
    logContent += `\n=================================================================\n`;

    try {
        fs.writeFileSync(logFilePath, logContent, 'utf8');
        console.log(`[RoutineManager] Log da rotina salvo em: ${logFileName}`);
    } catch (error) {
        console.error(`[RoutineManager] Erro ao salvar log da rotina ${logFileName}:`, error);
    }
}