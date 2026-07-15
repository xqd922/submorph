import type { ProxyNode } from "./types";

function generateProxyGroups(proxies: ProxyNode[], isAirportSubscription = true): Record<string, unknown>[] {
  const proxyNames = proxies.map(proxy => proxy.name);

  const hkProxies = proxyNames.filter(p => /香港|HK|Hong Kong|HKG/i.test(p))

  const minProxies = proxyNames.filter(p => /0\.[0-3](?:[0-9]*)?/.test(p))

  const manualProxies = ['Auto', 'DIRECT']
  if (hkProxies.length > 0) {
    manualProxies.push('HK')

    if (isAirportSubscription && minProxies.length > 0) manualProxies.push('Min')
  }
  manualProxies.push(...proxyNames)

  const embyProxies = ['Manual', 'DIRECT']
  if (isAirportSubscription && minProxies.length > 0) embyProxies.push('Min')
  embyProxies.push(...proxyNames)

  const groups: Record<string, unknown>[] = [
    {
      name: 'Manual',
      type: 'select',
      proxies: manualProxies
    },
    {
      name: 'Auto',
      type: 'url-test',
      proxies: proxyNames,
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50
    },
    {
      name: 'Emby',
      type: 'select',
      proxies: embyProxies
    },
    {
      name: 'AI',
      type: 'select',
      proxies: ['Manual', ...proxyNames]
    }
  ]

  if (hkProxies.length > 0) {
    groups.push({
      name: 'HK',
      type: 'url-test',
      proxies: hkProxies,
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50
    })
  }

  if (isAirportSubscription && minProxies.length > 0) {
    groups.push({
      name: 'Min',
      type: 'url-test',
      proxies: minProxies,
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50
    })
  }

  return groups
}

const MIHOMO_BASE = {
  'mixed-port': 7890,
  'allow-lan': true,
  'mode': 'rule',
  'log-level': 'info',
  'ipv6': true,
  'unified-delay': false,
  'tcp-concurrent': true,
  'keep-alive-idle': 300,
  'keep-alive-interval': 75,
  'find-process-mode': 'strict',
  'external-controller': '[::]:9090',
  'external-ui': 'ui',
  'external-ui-url': 'https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip',
  'secret': '',
  'profile': {
    'store-selected': true,
    'store-fake-ip': true
  },
  'sniffer': {
    'enable': true,
    'force-dns-mapping': true,
    'parse-pure-ip': true,
    'override-destination': true,
    'sniff': {
      'HTTP': { 'ports': [80, '8080-8880'], 'override-destination': true },
      'TLS': { 'ports': [443, 8443] },
      'QUIC': { 'ports': [443, 8443] }
    },
    'skip-domain': ['Mijia Cloud', '+.push.apple.com']
  },
  'dns': {
    'enable': true,
    'ipv6': true,
    'cache-algorithm': 'arc',
    'listen': '[::]:1053',
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'proxy-server-nameserver': ['https://doh.pub/dns-query'],
    'nameserver': ['https://dns.alidns.com/dns-query'],
    'nameserver-policy': {
      '*': 'system',
      '+.arpa': 'system',
      'rule-set:gfw': ['https://dns.google/dns-query#Manual']
    },
    'use-hosts': true,
    'direct-nameserver': ['system'],
    'fake-ip-filter': [
      'rule-set:private',
      'rule-set:tencent',
      'short.weixin.qq.com',
      'szshort.weixin.qq.com',
      'szextshort.weixin.qq.com',
      'szminorshort.weixin.qq.com',
      'mp.weixin.qq.com',
      '+.qpic.cn',
      '+.qlogo.cn',
      '+.gtimg.com',
      '+.idqqimg.com',
      '+.myqcloud.com',
      '+.wechat.com',
      '+.servicewechat.com',
      '+.tenpay.com',
      '+.qq.com',
      '+.market.xiaomi.com',
      'lancache.steamcontent.com',
      '+.edu.cn'
    ]
  },
  'hosts': {
    'dns.alidns.com': ['223.5.5.5', '223.6.6.6'],
    'doh.pub': ['1.12.12.21', '120.53.53.53'],
    'dns.google': ['8.8.8.8', '8.8.4.4']
  },
  'proxies': [],
  'proxy-groups': [],
  'rule-providers': {
    'private': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/private.mrs',
      'path': './rule_providers/private.mrs',
      'interval': 86400
    },
    'private-ip': {
      'type': 'http',
      'behavior': 'ipcidr',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/private.mrs',
      'path': './rule_providers/private_ip.mrs',
      'interval': 86400
    },
    'tencent': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/tencent.mrs',
      'path': './rule_providers/tencent.mrs',
      'interval': 86400
    },
    'ads': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-ads-all.mrs',
      'path': './rule_providers/ads.mrs',
      'interval': 86400
    },
    'ai': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/666OS/rules/release/mihomo/domain/AI.mrs',
      'path': './rule_providers/ai.mrs',
      'interval': 86400
    },
    'ai-ip': {
      'type': 'http',
      'behavior': 'ipcidr',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/666OS/rules/release/mihomo/ip/AI.mrs',
      'path': './rule_providers/ai_ip.mrs',
      'interval': 86400
    },
    'telegram': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/telegram.mrs',
      'path': './rule_providers/telegram.mrs',
      'interval': 86400
    },
    'telegram-ip': {
      'type': 'http',
      'behavior': 'ipcidr',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/telegram.mrs',
      'path': './rule_providers/telegram_ip.mrs',
      'interval': 86400
    },
    'github': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/github.mrs',
      'path': './rule_providers/github.mrs',
      'interval': 86400
    },
    'twitter': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/twitter.mrs',
      'path': './rule_providers/twitter.mrs',
      'interval': 86400
    },
    'youtube': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/youtube.mrs',
      'path': './rule_providers/youtube.mrs',
      'interval': 86400
    },
    'google': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/google.mrs',
      'path': './rule_providers/google.mrs',
      'interval': 86400
    },
    'gfw': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://github.com/DustinWin/ruleset_geodata/releases/download/mihomo-ruleset/gfw.mrs',
      'path': './rule_providers/gfw.mrs',
      'interval': 86400
    },
    'cn': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.mrs',
      'path': './rule_providers/cn.mrs',
      'interval': 86400
    },
    'cn-ip': {
      'type': 'http',
      'behavior': 'ipcidr',
      'format': 'mrs',
      'url': 'https://github.com/DustinWin/ruleset_geodata/releases/download/mihomo-ruleset/cnip.mrs',
      'path': './rule_providers/cn_ip.mrs',
      'interval': 86400
    },
    'emby': {
      'type': 'http',
      'behavior': 'domain',
      'format': 'mrs',
      'url': 'https://raw.githubusercontent.com/xqd922/rules/main/emby/emby.mrs',
      'path': './rule_providers/emby.mrs',
      'interval': 86400
    }
  },
  'rules': [

    'RULE-SET,private,DIRECT',
    'RULE-SET,private-ip,DIRECT,no-resolve',

    'PROCESS-NAME,com.qidian.QDReader,DIRECT',

    'PROCESS-NAME,com.icbc,DIRECT',
    'PROCESS-NAME,com.chinamworld.main,DIRECT',
    'PROCESS-NAME,com.android.bankabc,DIRECT',
    'PROCESS-NAME,com.chinamobile.nbc,DIRECT',
    'PROCESS-NAME,cmb.pb,DIRECT',
    'PROCESS-NAME,com.bankcomm.Bankcomm,DIRECT',
    'PROCESS-NAME,com.eg.android.AlipayGphone,DIRECT',
    'PROCESS-NAME,com.tencent.mm,DIRECT',
    'PROCESS-NAME,com.unionpay,DIRECT',

    'PROCESS-NAME,com.greenpoint.android.mc10086.activity,DIRECT',
    'PROCESS-NAME,com.sinovatech.unicom.ui,DIRECT',
    'PROCESS-NAME,com.ct.client,DIRECT',
    'PROCESS-NAME,com.ai.obc.cbn.app,DIRECT',

    'PROCESS-NAME,com.xunmeng.pinduoduo,DIRECT',
    'PROCESS-NAME,com.jingdong.app.mall,DIRECT',
    'PROCESS-NAME,com.taobao.taobao,DIRECT',
    'PROCESS-NAME,com.tmall.wireless,DIRECT',
    'PROCESS-NAME,com.taobao.idlefish,DIRECT',
    'PROCESS-NAME,com.sankuai.meituan,DIRECT',
    'PROCESS-NAME,com.achievo.vipshop,DIRECT',

    'PROCESS-NAME,com.tencent.wetype,DIRECT',

    'RULE-SET,tencent,DIRECT',
    'RULE-SET,ads,REJECT',

    'AND,((DST-PORT,443),(NETWORK,UDP)),REJECT',

    'DOMAIN,sub.xqd.pp.ua,DIRECT',
    'DOMAIN,1001.pp.ua,DIRECT',
    'DOMAIN-SUFFIX,gegeselect.hk,DIRECT',
    'DOMAIN,stream-1.sadchicktv.com,DIRECT',
    'DOMAIN-SUFFIX,neko.mo.cn,Manual',
    'IP-CIDR,95.161.76.100/31,REJECT,no-resolve',
    'DOMAIN-SUFFIX,steamcontent.com,DIRECT',
    'DOMAIN,msmp.abchina.com.cn,REJECT',
    'DOMAIN-SUFFIX,sharepoint.com,DIRECT',

    'RULE-SET,emby,Emby',

    'RULE-SET,ai,AI',
    'RULE-SET,ai-ip,AI,no-resolve',

    'RULE-SET,telegram,Manual',
    'RULE-SET,telegram-ip,Manual,no-resolve',
    'RULE-SET,github,Manual',
    'RULE-SET,twitter,Manual',
    'RULE-SET,youtube,Manual',
    'RULE-SET,google,Manual',
    'RULE-SET,gfw,Manual',
    'RULE-SET,cn,DIRECT',
    'RULE-SET,cn-ip,DIRECT,no-resolve',
    'DOMAIN,injections.adguard.org,DIRECT',
    'DOMAIN,local.adguard.org,DIRECT',
    'DOMAIN-SUFFIX,local,DIRECT',
    'DOMAIN-SUFFIX,cn,DIRECT',
    'DOMAIN-KEYWORD,-cn,DIRECT',
    'GEOIP,CN,DIRECT',
    'MATCH,Manual'
  ],
} as const

export function buildMihomoProfile(nodes: ProxyNode[], proxies: Record<string, unknown>[], isAirportSubscription = true): Record<string, unknown> {
	return { ...MIHOMO_BASE, proxies, "proxy-groups": generateProxyGroups(nodes, isAirportSubscription) };
}

export function buildSingboxProfile(validOutbounds: Record<string, unknown>[]) {

  return {
    log: {
      disabled: false,
      level: "info",
      output: "box.log",
      timestamp: true
    },
    dns: {
      servers: [
        {
          tag: "remote",
          type: "https",
          server: "8.8.8.8",
          detour: "Manual"
        },
        {
          tag: "local",
          type: "https",
          server: "223.5.5.5"
        },
        {
          type: "fakeip",
          tag: "fakeip",
          inet4_range: "198.18.0.0/15",
          inet6_range: "fc00::/18"
        }
      ],
      rules: [
        {
          rule_set: ["AdGuardSDNSFilter", "chrome-doh"],
          action: "reject"
        },
        {
          query_type: "HTTPS",
          action: "predefined"
        },
        {
          query_type: ["A", "AAAA"],
          rewrite_ttl: 1,
          server: "fakeip"
        },
        {
          clash_mode: "Direct",
          server: "local"
        },
        {
          clash_mode: "Global",
          server: "remote"
        },
        {
          rule_set: "geosite-cn",
          server: "local"
        },
        {
          rule_set: "ext-cn-domain",
          server: "local"
        }
      ],
      strategy: "prefer_ipv4",
      independent_cache: true
    },
    inbounds: [
      {
        type: "tun",
        address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
        strict_route: true,
        mtu: 9000,
        endpoint_independent_nat: true,
        auto_route: true
      },
      {
        type: "socks",
        tag: "socks-in",
        listen: "127.0.0.1",
        listen_port: 2333,
        users: []
      },
      {
        type: "mixed",
        tag: "mixed-in",
        listen: "127.0.0.1",
        listen_port: 2334,
        users: []
      }
    ],
    outbounds: [
      ...validOutbounds,
      {
        type: "selector",
        tag: "Manual",
        outbounds: ["Auto", ...validOutbounds.map(o => o.tag)],
        default: "Auto",
        interrupt_exist_connections: false
      },
      {
        type: "urltest",
        tag: "Auto",
        outbounds: validOutbounds.map(o => o.tag),
        url: "https://www.gstatic.com/generate_204",
        interval: "300s",
        tolerance: 50,
        idle_timeout: "30m",
        interrupt_exist_connections: false
      },
      {
        type: "direct",
        tag: "direct"
      }
    ],
    route: {
      rules: [
        {
          action: "sniff"
        },
        {
          protocol: "dns",
          action: "hijack-dns"
        },
        {
          rule_set: ["AdGuardSDNSFilter"],
          action: "reject"
        },
        {
          network: "udp",
          port: 443,
          action: "reject",
          method: "default"
        },
        {
          clash_mode: "Direct",
          outbound: "direct"
        },
        {
          clash_mode: "Global",
          outbound: "Manual"
        },
        {
          domain: ["speedtest-half.gegeselect.hk"],
          outbound: "direct"
        },
        {
          domain_suffix: [
            "apple-cdn.net",
            "sharepoint.com"
          ],
          outbound: "direct"
        },
        {
          rule_set: ["geosite-cn", "ext-cn-domain"],
          outbound: "direct"
        },
        {
          rule_set: "geoip-cn",
          outbound: "direct"
        },
        {
          ip_is_private: true,
          outbound: "direct"
        }
      ],
      final: "Manual",
      auto_detect_interface: true,
      default_domain_resolver: {
        server: "local"
      },
      rule_set: [
        {
          tag: "geoip-cn",
          type: "remote",
          format: "binary",
          url: "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs"
        },
        {
          tag: "geosite-cn",
          type: "remote",
          format: "binary",
          url: "https://raw.githubusercontent.com/xmdhs/sing-geosite/rule-set-Loyalsoldier/geosite-geolocation-cn.srs"
        },
        {
          tag: "AdGuardSDNSFilter",
          type: "remote",
          format: "binary",
          url: "https://raw.githubusercontent.com/xmdhs/sing-box-ruleset/rule-set/AdGuardSDNSFilterSingBox.srs"
        },
        {
          tag: "chrome-doh",
          type: "remote",
          format: "source",
          url: "https://gist.githubusercontent.com/xmdhs/71fc5ff6ef29f5ecaf2c52b8de5c3172/raw/chrome-doh.json"
        },
        {
          tag: "ext-cn-domain",
          type: "remote",
          format: "binary",
          url: "https://raw.githubusercontent.com/xmdhs/cn-domain-list/rule-set/ext-cn-list.srs"
        }
      ]
    },
    experimental: {
      cache_file: {
        enabled: true
      },
      clash_api: {
        external_controller: "127.0.0.1:9090",
        external_ui: "ui",
        external_ui_download_url: "https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip",
        external_ui_download_detour: "Manual",
        secret: ""
      }
    }
  }
}

