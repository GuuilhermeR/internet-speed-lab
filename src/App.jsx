import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  ConfigProvider,
  Layout,
  Progress,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd'
import {
  AreaChartOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FieldTimeOutlined,
  GlobalOutlined,
  PlayCircleFilled,
  RadarChartOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  WifiOutlined,
} from '@ant-design/icons'
import ndt7 from '@m-lab/ndt7'
import './App.css'

const { Content } = Layout
const { Text, Title } = Typography

const NDT_CONFIG = {
  downloadworkerfile: '/ndt7-download-worker.js',
  uploadworkerfile: '/ndt7-upload-worker.js',
  userAcceptedDataPolicy: true,
  metadata: {
    client_name: 'internet-speed-lab',
    client_version: '0.2.0',
  },
}

const emptyNetworkInfo = {
  ip: null,
  provider: null,
  city: null,
  region: null,
  country: null,
  timezone: null,
}

const initialMetrics = {
  download: 0,
  upload: 0,
  ping: 0,
  jitter: 0,
  packetLoss: 0,
  loadedPing: 0,
  loadedJitter: 0,
  bufferbloat: 0,
}

const formatNumber = (value, digits = 1) =>
  Number.isFinite(value) ? value.toFixed(digits) : '--'

const cacheKey = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

const getConnectionInfo = () => {
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection

  if (!connection) {
    return {
      downlink: null,
      effectiveType: 'Indisponível',
      rtt: null,
      saveData: false,
      source: 'Medição real até o servidor escolhido',
    }
  }

  return {
    downlink: connection.downlink ?? null,
    effectiveType: connection.effectiveType ?? 'Indefinido',
    rtt: connection.rtt ?? null,
    saveData: Boolean(connection.saveData),
    source: 'Medição real com dados do navegador',
  }
}

const fetchNetworkInfo = async () => {
  const response = await fetch(`/api/network-info?cache=${cacheKey()}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

const toMilliseconds = (value) => {
  if (!Number.isFinite(value)) return 0
  return value > 1000 ? value / 1000 : value
}

const getTcpMetrics = (data) => {
  const tcpInfo = data?.TCPInfo || {}
  const bbrInfo = data?.BBRInfo || {}
  const minRtt = toMilliseconds(tcpInfo.MinRTT || bbrInfo.MinRTT || 0)
  const rtt = toMilliseconds(tcpInfo.RTT || tcpInfo.RcvRTT || minRtt)
  const rttVar = toMilliseconds(tcpInfo.RTTVar || 0)
  const lossRate = Number.isFinite(data?.LossRate) ? data.LossRate : 0

  return { minRtt, rtt, rttVar, lossRate }
}

const getMbps = (data) => {
  if (Number.isFinite(data?.MeanClientMbps)) return data.MeanClientMbps
  if (
    Number.isFinite(data?.AppInfo?.NumBytes) &&
    Number.isFinite(data?.AppInfo?.ElapsedTime)
  ) {
    return (data.AppInfo.NumBytes * 8) / 1_000_000 / data.AppInfo.ElapsedTime
  }
  return 0
}

const runNdtMeasurement = async ({ setPhase, setMetrics, onServerChosen }) => {
  const urls = await ndt7.discoverServerURLs(NDT_CONFIG, {
    serverDiscovery: () => setPhase('Selecionando servidor próximo'),
    serverChosen: onServerChosen,
  })

  const nextMetrics = { ...initialMetrics }
  let baselineRtt = 0

  const updateTcpMetrics = (data, mode) => {
    const tcpMetrics = getTcpMetrics(data)
    const observedRtt = tcpMetrics.minRtt || tcpMetrics.rtt

    if (observedRtt && (!baselineRtt || observedRtt < baselineRtt)) {
      baselineRtt = observedRtt
      nextMetrics.ping = observedRtt
    }

    if (mode === 'download') {
      nextMetrics.loadedPing = tcpMetrics.rtt || nextMetrics.loadedPing
      nextMetrics.loadedJitter = tcpMetrics.rttVar || nextMetrics.loadedJitter
    }

    nextMetrics.jitter = tcpMetrics.rttVar || nextMetrics.jitter
    nextMetrics.packetLoss = Math.max(nextMetrics.packetLoss, tcpMetrics.lossRate * 100)
    nextMetrics.bufferbloat = Math.max(
      0,
      (nextMetrics.loadedPing || nextMetrics.ping) - nextMetrics.ping,
    )
  }

  setPhase('Medindo download')
  const downloadCode = await ndt7.downloadTest(
    NDT_CONFIG,
    {
      downloadMeasurement: ({ Source, Data }) => {
        const mbps = getMbps(Data)
        if (mbps) nextMetrics.download = mbps
        if (Source === 'server') updateTcpMetrics(Data, 'download')
        setMetrics({ ...nextMetrics })
      },
      downloadComplete: ({ LastClientMeasurement, LastServerMeasurement }) => {
        const mbps = getMbps(LastClientMeasurement)
        if (mbps) nextMetrics.download = mbps
        updateTcpMetrics(LastServerMeasurement, 'download')
        setMetrics({ ...nextMetrics })
      },
    },
    Promise.resolve(urls),
  )

  if (downloadCode !== 0) {
    throw new Error('Falha no teste NDT7 de download.')
  }

  setPhase('Medindo upload')
  const uploadCode = await ndt7.uploadTest(
    NDT_CONFIG,
    {
      uploadMeasurement: ({ Source, Data }) => {
        const mbps = getMbps(Data)
        if (mbps) nextMetrics.upload = mbps
        if (Source === 'server') updateTcpMetrics(Data, 'upload')
        setMetrics({ ...nextMetrics })
      },
      uploadComplete: ({ LastClientMeasurement, LastServerMeasurement }) => {
        const mbps = getMbps(LastClientMeasurement)
        if (mbps) nextMetrics.upload = mbps
        updateTcpMetrics(LastServerMeasurement, 'upload')
        setMetrics({ ...nextMetrics })
      },
    },
    Promise.resolve(urls),
  )

  if (uploadCode !== 0) {
    throw new Error('Falha no teste NDT7 de upload.')
  }

  return nextMetrics
}

const getScore = ({ download, upload, ping, jitter, packetLoss, bufferbloat }) => {
  if (!download && !upload && !ping) return 0

  const speedScore = Math.min((download || 0) / 300, 1) * 30
  const uploadScore = Math.min((upload || 0) / 100, 1) * 20
  const latencyScore = Math.max(0, 1 - (ping || 0) / 180) * 20
  const stabilityScore =
    Math.max(0, 1 - (jitter || 0) / 80) * 12 +
    Math.max(0, 1 - (packetLoss || 0) / 5) * 8
  const loadScore = Math.max(0, 1 - (bufferbloat || 0) / 180) * 10

  return Math.round(speedScore + uploadScore + latencyScore + stabilityScore + loadScore)
}

const qualityLabel = (score) => {
  if (score >= 85) return ['Excelente', 'success']
  if (score >= 65) return ['Boa', 'processing']
  if (score >= 45) return ['Instável', 'warning']
  return ['Crítica', 'error']
}

function App() {
  const [isTesting, setIsTesting] = useState(false)
  const [phase, setPhase] = useState('Pronto para testar')
  const [error, setError] = useState('')
  const [connection, setConnection] = useState(getConnectionInfo)
  const [networkInfo, setNetworkInfo] = useState(emptyNetworkInfo)
  const [selectedServer, setSelectedServer] = useState({
    machine: 'Aguardando seleção',
    city: null,
    country: null,
  })
  const [metrics, setMetrics] = useState(initialMetrics)

  const score = useMemo(() => getScore(metrics), [metrics])
  const [label, labelStatus] = qualityLabel(score)

  const metricCards = [
    {
      icon: <FieldTimeOutlined />,
      label: 'Ping',
      value: formatNumber(metrics.ping, 0),
      unit: 'ms',
      description: 'Tempo de resposta da conexão. Quanto menor, melhor para jogos, chamadas e acesso remoto.',
    },
    {
      icon: <AreaChartOutlined />,
      label: 'Jitter',
      value: formatNumber(metrics.jitter, 0),
      unit: 'ms',
      description: 'Variação do ping. Quando está alto, pode causar travamentos e falhas de áudio em chamadas.',
    },
    {
      icon: <SafetyCertificateOutlined />,
      label: 'Perda de pacotes',
      value: formatNumber(metrics.packetLoss, 1),
      unit: '%',
      description: 'Percentual de dados que se perdem no caminho. Acima de 1% já pode indicar instabilidade.',
    },
    {
      icon: <WifiOutlined />,
      label: 'Bufferbloat',
      value: formatNumber(metrics.bufferbloat, 0),
      unit: 'ms',
      description: 'Mostra o quanto a latência piora quando a internet está ocupada baixando ou enviando dados.',
    },
  ]

  const detailItems = [
    ['Servidor do teste', selectedServer.machine],
    [
      'Local do servidor',
      [selectedServer.city, selectedServer.country].filter(Boolean).join(', ') || '--',
    ],
    ['Latência sob carga', `${formatNumber(metrics.loadedPing, 0)} ms`],
    ['Jitter sob carga', `${formatNumber(metrics.loadedJitter, 0)} ms`],
    ['Downlink estimado', connection.downlink ? `${connection.downlink} Mbps` : '--'],
    ['RTT do navegador', connection.rtt ? `${connection.rtt} ms` : '--'],
    ['Modo de economia de dados', connection.saveData ? 'Ativo' : 'Inativo'],
  ]

  const networkItems = [
    ['IP público', networkInfo.ip || '--'],
    ['Provedor', networkInfo.provider || '--'],
    [
      'Localização aproximada',
      [networkInfo.city, networkInfo.region, networkInfo.country].filter(Boolean).join(', ') ||
        '--',
    ],
    ['Fuso horário', networkInfo.timezone || '--'],
  ]

  const runTest = async () => {
    setIsTesting(true)
    setError('')
    setConnection(getConnectionInfo())
    setMetrics(initialMetrics)
    setSelectedServer({
      machine: 'Selecionando automaticamente',
      city: null,
      country: null,
    })

    try {
      setPhase('Consultando IP e provedor de internet')
      setNetworkInfo(await fetchNetworkInfo())

      await runNdtMeasurement({
        setPhase,
        setMetrics,
        onServerChosen: (server) => {
          setSelectedServer({
            machine: server.machine || server.hostname || 'Servidor M-Lab',
            city: server.location?.city || null,
            country: server.location?.country || null,
          })
        },
      })

      setPhase('Teste concluído')
    } catch (caughtError) {
      setError(
        'Não foi possível concluir a medição. Tente novamente. VPN, firewall ou bloqueio de WebSocket podem impedir o teste.',
      )
      setPhase('Teste interrompido')
      console.error(caughtError)
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#18b89d',
          colorInfo: '#3f8cff',
          colorBgBase: '#f6f8fb',
          colorTextBase: '#10201f',
          borderRadius: 8,
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        },
      }}
    >
      <Layout className="app-shell">
        <Content className="page">
          <header className="topbar">
            <Space size={12} align="center">
              <span className="brand-mark">
                <RadarChartOutlined />
              </span>
              <div>
                <Text className="eyebrow">Internet Speed Lab</Text>
                <Title level={1}>Medidor técnico de internet</Title>
              </div>
            </Space>
          </header>

          {error && <Alert className="status-alert" type="warning" showIcon message={error} />}

          <main className="dashboard">
            <section className="hero-panel">
              <div className="console-header">
                <div>
                  <Text className="eyebrow">{phase}</Text>
                  <Title level={2}>Teste de velocidade</Title>
                </div>
                <div className="hero-tags">
                  <Tag color={labelStatus}>{label}</Tag>
                  <span>{connection.source}</span>
                </div>
              </div>

              <div className="test-stage">
                <div className="speed-card primary-speed">
                  <CloudDownloadOutlined />
                  <span>Download</span>
                  <strong>{formatNumber(metrics.download)}</strong>
                  <small>Indica a velocidade para receber vídeos, páginas, arquivos e atualizações.</small>
                </div>

                <div className="center-console">
                  <Progress
                    type="dashboard"
                    className="connection-score-progress"
                    percent={score}
                    size={170}
                    strokeColor={{
                      '0%': '#ff6464',
                      '55%': '#f6bd45',
                      '100%': '#27e0bd',
                    }}
                    trailColor="rgba(255,255,255,0.1)"
                    format={(value) => `${value}`}
                  />
                  <Button
                    className="primary-test-button"
                    type="primary"
                    size="large"
                    icon={isTesting ? <ReloadOutlined spin /> : <PlayCircleFilled />}
                    loading={isTesting}
                    onClick={runTest}
                  >
                    {isTesting ? 'Testando conexão' : 'Iniciar teste'}
                  </Button>
                  <p>
                    Mede sua conexão real contra um servidor próximo e destaca os
                    gargalos que afetam chamadas, jogos e streaming.
                  </p>
                </div>

                <div className="speed-card">
                  <CloudUploadOutlined />
                  <span>Upload</span>
                  <strong>{formatNumber(metrics.upload)}</strong>
                  <small>Indica a velocidade para enviar arquivos, fazer chamadas de vídeo, transmissões ao vivo e backups.</small>
                </div>
              </div>
            </section>

            <section className="metric-grid" aria-label="Medições técnicas">
              {metricCards.map((item) => (
                <article className="metric-card" key={item.label}>
                  <div className="metric-icon">{item.icon}</div>
                  <div>
                    <span className="metric-label">{item.label}</span>
                    <strong>
                      {item.value} <small>{item.unit}</small>
                    </strong>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </section>

            <section className="info-grid">
              <article className="panel">
                <div className="section-heading">
                  <DashboardOutlined />
                  <Title level={3}>Detalhes do teste</Title>
                </div>
                <div className="detail-list">
                  {detailItems.map(([labelText, value]) => (
                    <div key={labelText}>
                      <Text type="secondary">{labelText}</Text>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel">
                <div className="section-heading">
                  <GlobalOutlined />
                  <Title level={3}>Rede detectada</Title>
                </div>
                <div className="detail-list">
                  {networkItems.map(([labelText, value]) => (
                    <div key={labelText}>
                      <Text type="secondary">{labelText}</Text>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel readable-panel">
                <div className="section-heading">
                  <EnvironmentOutlined />
                  <Title level={3}>Como interpretar</Title>
                </div>
                <div className="diagnostic-list">
                  <div>
                    <CloudServerOutlined />
                    <span>
                      Servidor mais próximo tende a dar uma leitura mais justa da sua internet.
                    </span>
                  </div>
                  <div>
                    <WifiOutlined />
                    <span>
                      Mesmo com velocidade alta, ping ou jitter ruins ainda podem causar travamentos.
                    </span>
                  </div>
                  <div>
                    <SafetyCertificateOutlined />
                    <span>
                      Refaça o teste por cabo e por Wi-Fi para comparar se o problema está na rede local.
                    </span>
                  </div>
                </div>
              </article>
            </section>

          </main>
        </Content>
      </Layout>
    </ConfigProvider>
  )
}

export default App
