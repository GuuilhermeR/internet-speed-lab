# Internet Speed Lab

Aplicação web para medir a qualidade da conexão de internet do usuário, com foco em velocidade real, latência e estabilidade.

O projeto foi criado com React, Vite e Ant Design. A medição principal de download e upload usa NDT7/M-Lab, que seleciona automaticamente um servidor de teste próximo ao usuário.

## Funcionalidades

- Medição de download em Mbps.
- Medição de upload em Mbps.
- Score geral da conexão.
- Ping, jitter, perda de pacotes e bufferbloat.
- Identificação de IP público, provedor e localização aproximada.
- Exibição do servidor selecionado para o teste.
- Descrições simples para usuários não técnicos entenderem cada métrica.
- Layout responsivo para desktop e mobile.

## Métricas

**Download**  
Velocidade para receber dados, como vídeos, páginas, arquivos e atualizações.

**Upload**  
Velocidade para enviar dados, como arquivos, chamadas de vídeo, transmissões ao vivo e backups.

**Ping**  
Tempo de resposta da conexão. Quanto menor, melhor para jogos, chamadas e acesso remoto.

**Jitter**  
Variação do ping. Quando está alto, pode causar travamentos e falhas de áudio em chamadas.

**Perda de pacotes**  
Percentual de dados que se perdem no caminho. Acima de 1% já pode indicar instabilidade.

**Bufferbloat**  
Mostra o quanto a latência piora quando a internet está ocupada baixando ou enviando dados.

## Stack

- React
- Vite
- Ant Design
- M-Lab NDT7
- Node.js para endpoints auxiliares

## Como rodar em desenvolvimento

```bash
npm install
npm run dev
```

Acesse:

```text
http://127.0.0.1:5173
```

## Scripts

```bash
npm run dev
```

Inicia o ambiente de desenvolvimento com Vite.

```bash
npm run build
```

Gera a versão de produção.

```bash
npm run lint
```

Executa a verificação de lint.

```bash
npm run start
```

Serve a pasta `dist` usando o servidor Node incluído no projeto.

## Como a medição funciona

O teste usa a biblioteca `@m-lab/ndt7`. Ela consulta a rede da Measurement Lab para localizar um servidor próximo ao usuário e realiza medições reais de download e upload por WebSocket.

Os workers usados pelo NDT7 ficam em:

```text
public/ndt7-download-worker.js
public/ndt7-upload-worker.js
```

O projeto também possui endpoints auxiliares em:

```text
server/speed-api.js
```

Eles são usados para informações como IP, provedor e localização aproximada.

## Observações importantes

Os resultados podem ser diferentes de sites como Ookla/Speedtest porque cada serviço usa sua própria rede de servidores, protocolo e metodologia.

O M-Lab seleciona servidores próximos ao usuário, mas não necessariamente servidores da operadora da pessoa. Para usar servidores específicos de operadoras, é necessário que eles sejam públicos, compatíveis e autorizados para esse tipo de medição.

Em ambiente local, algumas informações como IP e localização podem aparecer limitadas, porque o teste está rodando em `localhost`.

VPNs, firewalls, bloqueios de WebSocket e políticas de rede podem impedir ou alterar os resultados do teste.

## Estrutura principal

```text
src/App.jsx              Tela principal e lógica da medição
src/App.css              Estilos da interface
server/speed-api.js      Endpoints auxiliares
server/index.js          Servidor Node para produção
public/                  Arquivos públicos e workers NDT7
```
