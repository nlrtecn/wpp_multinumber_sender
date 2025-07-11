document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Conecta ao Socket.IO
    const clientTableBody = document.getElementById('clientTableBody');
    const sendMessageForm = document.getElementById('sendMessageForm');
    const clientIdSelect = document.getElementById('clientId');

    let allClients = []; // Variável para manter o estado de todos os clientes no frontend

    // Função para atualizar a tabela de clientes
    function updateClientTable(clientsToDisplay) {
        clientTableBody.innerHTML = ''; // Limpa a tabela antes de redesenhar
        clientIdSelect.innerHTML = '<option value="">Selecione um Cliente</option>'; // Limpa o select

        clientsToDisplay.forEach(client => {
            const row = clientTableBody.insertRow();

            // Coluna ID
            let cell = row.insertCell();
            cell.textContent = client.id;

            // Coluna Nome
            cell = row.insertCell();
            cell.textContent = client.name;

            // Coluna Status
            cell = row.insertCell();
            cell.textContent = client.status;

            // Coluna Diretório da Sessão
            cell = row.insertCell();
            cell.textContent = client.sessionDir || 'N/A';

            // Coluna QR Code / Botão Reautenticar
            cell = row.insertCell();
            if (client.status === 'QR_CODE' && client.qr) {
                const qrImg = document.createElement('img');
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(client.qr)}`;
                qrImg.alt = `QR Code para Cliente ${client.id}`;
                qrImg.style.width = '100px';
                qrImg.style.height = '100px';
                cell.appendChild(qrImg);
            } else if (client.status === 'Desconectado' || client.status === 'Falha na Autenticação' || client.status === 'Erro de Inicialização') {
                const reauthButton = document.createElement('button');
                reauthButton.textContent = 'Reautenticar';
                reauthButton.className = 'reauth-button'; // Adiciona uma classe para estilização, se desejar
                reauthButton.onclick = () => reauthenticateClient(client.id);
                cell.appendChild(reauthButton);
            } else {
                cell.textContent = 'N/A';
            }

            // Adiciona o cliente ao select de envio de mensagem se estiver pronto
            if (client.status === 'Pronto') {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = client.name;
                clientIdSelect.appendChild(option);
            }
        });
    }

    // Função para reautenticar um cliente
    async function reauthenticateClient(clientId) {
        try {
            const response = await fetch('/api/reauthenticate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ clientId }),
            });
            const data = await response.json();
            if (data.success) {
                alert(data.message);
                // O status será atualizado via Socket.IO
            } else {
                alert(`Erro ao reautenticar: ${data.message}`);
            }
        } catch (error) {
            console.error('Erro ao reautenticar cliente:', error);
            alert('Erro ao conectar com o servidor para reautenticar.');
        }
    }

    // --- Listeners Socket.IO ---
    socket.on('initialClientStatus', (clients) => {
        console.log('Status inicial dos clientes recebido:', clients);
        allClients = clients; // Armazena o estado inicial
        updateClientTable(allClients);
    });

    socket.on('clientStatusUpdate', (client) => {
        console.log('Atualização de status de cliente recebida:', client);
        
        const existingClientIndex = allClients.findIndex(c => c.id === client.id);
        if (existingClientIndex !== -1) {
            allClients[existingClientIndex] = client; // Atualiza o cliente existente
        } else {
            allClients.push(client); // Adiciona um novo cliente
        }
        // Garante que a lista esteja ordenada pelo ID antes de redesenhar
        allClients.sort((a, b) => a.id - b.id);
        updateClientTable(allClients); // Redesenha a tabela com a lista atualizada
    });

    // --- Envio de Mensagem ---
    sendMessageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const clientId = document.getElementById('clientId').value;
        const number = document.getElementById('number').value;
        const message = document.getElementById('message').value;

        if (!clientId || !number || !message) {
            alert('Por favor, preencha todos os campos para enviar a mensagem.');
            return;
        }

        try {
            const response = await fetch('/api/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ clientId, number, message }),
            });
            const data = await response.json();
            alert(data.message);
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            alert('Erro ao conectar com o servidor para enviar mensagem.');
        }
    });

    // Função para buscar o status inicial dos clientes ao carregar a página
    // Agora, esta função apenas faz a requisição, e o Socket.IO fará a atualização real.
    async function fetchInitialClientStatus() {
        try {
            const response = await fetch('/api/clients/status');
            const clients = await response.json();
            // A emissão 'initialClientStatus' do Socket.IO já fará a atualização via allClients
            // Mas para garantir que a UI tenha dados imediatamente caso o socket demore:
            allClients = clients;
            updateClientTable(allClients);
        } catch (error) {
            console.error('Erro ao buscar status inicial dos clientes:', error);
        }
    }

    fetchInitialClientStatus(); // Chama a função ao carregar a página
});