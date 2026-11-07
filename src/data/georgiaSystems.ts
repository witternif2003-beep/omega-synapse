// ============================================================================
// OMEGA PROTOCOL: 50 GEORGIA STATE PROPRIETARY SYSTEMS ANOMALY REGISTRY
// Complete SI International Metrics, Identifying Methodology & Re-interment Workflows
// ============================================================================

export interface GeorgiaSystemAnomaly {
  id: string;
  systemName: string;
  entity: string;
  facility: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  anomalyTitle: string;
  title?: string;
  ts: string;
  url: string;
  siMetrics: string;
  identifyingMethodology: string;
  reintermentWorkflow: {
    reintermentState: 'REINTERRED_KERNEL_CLAMPED' | 'REINTERRED_AIR_GAPPED' | 'REINTERRED_FAILOVER_ENGAGED' | 'REINTERRED_QUARANTINED' | 'REINTERRED_CANARY_DEFUSED' | 'REINTERRED_HSM_LOCKED';
    reintermentMethod: string;
    timeToReinterment: string;
    guaranteedInvariant: string;
  };
}

export const georgia50SystemsRegistry: GeorgiaSystemAnomaly[] = [
  // DELTA AIR LINES (6 Systems)
  {
    id: 'DAL-SYS-01',
    systemName: 'ACARS ARINC-429 VHF Gateway Transceiver',
    entity: 'Delta Air Lines',
    facility: 'Hartsfield-Jackson Core (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'Non-Monotonic ACARS Packet Timestamp Sequence Rollover Anomaly',
    ts: new Date(Date.now() - 45000).toISOString(),
    url: 'https://aviation-isac.org/bulletins/ga-dal-acars-01',
    siMetrics: 'Δt: 14.8 µs · Jitter: 18.2 ps · Ingress: 48.2 kpps · BER: 2.1×10⁻⁹',
    identifyingMethodology: 'eBPF Non-Monotonic Sequence Gap Detector (Δseq = -14 frame jump below monotonic floor)',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Injected eBPF XDP filter enforcing monotonic 64-bit sequence counters at VHF demodulator',
      timeToReinterment: 'Δt_reinter: 4.8 µs',
      guaranteedInvariant: 'Monotonic Sequence Enforced (Zero Out-of-Order Waypoints)'
    }
  },
  {
    id: 'DAL-SYS-02',
    systemName: 'Flight Slot Reservation gRPC Mesh Engine',
    entity: 'Delta Air Lines',
    facility: 'Operations Control Center (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'gRPC HTTP/2 Stream Idempotency Nonce Collision on Concurrency Surge',
    ts: new Date(Date.now() - 95000).toISOString(),
    url: 'https://bgpstream.crossfield.net/as/AS3356',
    siMetrics: 'P99 Latency: 210 µs · Jitter: 42 ps · Bandwidth: 14.2 Gbps · RTT: 1.82 ms',
    identifyingMethodology: 'Median Absolute Deviation (MAD) robust z-score (z = 4.82 > 4.00 threshold) on gRPC latency distribution',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Envoy proxy edge Lua filter with distributed bloom filter for monotonic nonces',
      timeToReinterment: 'Δt_reinter: 1.82 ms',
      guaranteedInvariant: 'Zero Duplicate Slot Reservation Invariant Active'
    }
  },
  {
    id: 'DAL-SYS-03',
    systemName: 'SkyMiles Cassandra Distributed Token Cluster',
    entity: 'Delta Air Lines',
    facility: 'SkyTeam Hybrid Datacenter (Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'Cassandra Multi-Region Asynchronous Read Repair Replica Divergence',
    ts: new Date(Date.now() - 150000).toISOString(),
    url: 'https://cisa.gov/known-exploited-vulnerabilities-catalog',
    siMetrics: 'Latency: 340 µs · Jitter: 8.5 ps · Sync: 99.998% · Shannon Entropy: 7.994 b/B',
    identifyingMethodology: 'CUSUM Drift Detector (h = 5.0, k = 0.5) on cross-datacenter commit-log timestamps',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_FAILOVER_ENGAGED',
      reintermentMethod: 'Atomic Redis cluster token consumption with single-RTT Lua execution (340 µs)',
      timeToReinterment: 'Δt_reinter: 340 µs',
      guaranteedInvariant: 'Strict Linearizability Across Loyalty Balances'
    }
  },
  {
    id: 'DAL-SYS-04',
    systemName: 'Hartsfield-Jackson Baggage Sortation EPC RFID Matrix',
    entity: 'Delta Air Lines',
    facility: 'Hartsfield-Jackson Terminal South (Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'EPCglobal Class 1 Gen 2 Dense Reader Mode Intermodulation Collision',
    ts: new Date(Date.now() - 210000).toISOString(),
    url: 'https://aviation-isac.org/bulletins/ga-dal-baggage',
    siMetrics: 'Carrier: 915.000 MHz · RSSI: -64.2 dBm · Scan Rate: 1,420 tags/sec · BER: 10⁻¹²',
    identifyingMethodology: 'Fast Fourier Transform (FFT) Carrier Phase Drift (Δf = 14.2 kHz intermodulation sideband)',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Automated hopping frequency synthesizer adjustment & cryptographic tag mutual auth',
      timeToReinterment: 'Δt_reinter: 18.4 ms',
      guaranteedInvariant: '100% Deterministic Luggage Diverter Trajectory'
    }
  },
  {
    id: 'DAL-SYS-05',
    systemName: 'Flight Management System (FMS) ARINC 702A Navigation Data Bus',
    entity: 'Delta Air Lines',
    facility: 'Hartsfield Technical Operations (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'ARINC 702A Waypoint Navigation Cyclic Redundancy Check Bit Slip',
    ts: new Date(Date.now() - 270000).toISOString(),
    url: 'https://aviation-isac.org/bulletins/ga-dal-fms',
    siMetrics: 'Clock: 100.000 kHz · Bus Voltage: 10.0 V differential · Parity Slip: 1.2×10⁻¹¹',
    identifyingMethodology: 'CRC-32 Autonomic Verification Matrix with Bitwise Parity Inversion Trapping',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_FAILOVER_ENGAGED',
      reintermentMethod: 'Dual FMS failover to inertial reference unit (IRU) ring laser gyro navigation bus',
      timeToReinterment: 'Δt_reinter: 12.0 µs',
      guaranteedInvariant: 'RNP 0.1 Required Navigation Performance Integrity'
    }
  },
  {
    id: 'DAL-SYS-06',
    systemName: 'Jet-A Fuel Hydrant Metering & Hydromechanical Pressure SCADA',
    entity: 'Delta Air Lines',
    facility: 'Atlanta Airport Tank Farm (Clayton County, GA)',
    severity: 'medium',
    anomalyTitle: 'Pipeline Transient Pressure Water Hammer Surge on Hydrant Manifold',
    ts: new Date(Date.now() - 330000).toISOString(),
    url: 'https://ics-cert.us-cert.gov/advisories/dal-fuel-scada',
    siMetrics: 'Flow: 180.4 L/s · Pressure: 1,034 kPa (150 psi) · Surge Wave: 1,120 m/s',
    identifyingMethodology: 'Acoustic Wavelet Pulse Peak Tracking on high-speed piezo-electric transducer',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Surge suppressor valve pneumatic fast-actuation clamp triggered via PLC Modbus',
      timeToReinterment: 'Δt_reinter: 18.0 ms',
      guaranteedInvariant: 'Hydrant Line Pressure Maintained < 1,100 kPa'
    }
  },

  // THE COCA-COLA COMPANY (6 Systems)
  {
    id: 'KO-SYS-07',
    systemName: 'North Ave Syrup Concentrate Formulation PLC Manifold (Siemens S7-1500)',
    entity: 'Coca-Cola',
    facility: 'Concentrate Formulation Core (Atlanta, GA)',
    severity: 'critical',
    anomalyTitle: 'Profinet Layer-2 Broadcast Telemetry Leak on Proprietary Dosing Loop',
    ts: new Date(Date.now() - 40000).toISOString(),
    url: 'https://ics-cert.us-cert.gov/advisories/ko-scada-syrup',
    siMetrics: 'Flow: 14.8 L/s · Temp: 277.15 K (4°C) · Pressure: 410 kPa · Netfilter: 0 ppm loss',
    identifyingMethodology: 'Deep Packet Inspection (DPI) detecting unsegmented ISO-on-TCP (Port 102) S7comm frames',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_AIR_GAPPED',
      reintermentMethod: 'Hardware NFTables netfilter isolation dropping all non-whitelisted engineering console packets',
      timeToReinterment: 'Δt_reinter: 88 µs',
      guaranteedInvariant: 'Complete OT-IT Air Gap Boundary Preserved (ASC 350 Protected)'
    }
  },
  {
    id: 'KO-SYS-08',
    systemName: 'Global Bottler SAP S/4HANA EDI Invoicing Gateway',
    entity: 'Coca-Cola',
    facility: 'Corporate Financial Operations (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'EDI 810 Invoicing Currency Decimal Drift during ECB/Fed Settlement Window',
    ts: new Date(Date.now() - 110000).toISOString(),
    url: 'https://sec.gov/edgar/browse/?CIK=0000021344',
    siMetrics: 'Throughput: 8,400 msg/s · Settlement: 120 ms · Currency Basis: 0.8 bps',
    identifyingMethodology: 'Real-time double-entry cryptographic reconciliation hash divergence detector',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_HSM_LOCKED',
      reintermentMethod: 'Automated Continuous Linked Settlement (CLS) payment vs. payment (PvP) atomic ledger lock',
      timeToReinterment: 'Δt_reinter: 120 ms',
      guaranteedInvariant: 'Zero Currency Translation Drift Across Bottling Matrix'
    }
  },
  {
    id: 'KO-SYS-09',
    systemName: 'High-Speed Bottling Line Optical Laser Fill-Level Sorter',
    entity: 'Coca-Cola',
    facility: 'Atlanta Production Plant (Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'Laser Diode Optocoupler Thermal Jitter inducing Phantom Bottle Rejections',
    ts: new Date(Date.now() - 170000).toISOString(),
    url: 'https://ics-cert.us-cert.gov/advisories/ko-optical-sorter',
    siMetrics: 'Line Speed: 2,200 cans/min · Laser Lambda: 650.0 nm · Jitter: 42.0 ps · Rejection: 0.001%',
    identifyingMethodology: 'Optical Power Sensor Photodiode Voltage Fluctuation Monitoring (ΔV > 12.0 mV)',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Peltier thermoelectric cooler feedback loop stabilizing laser diode junction to 298.15 K',
      timeToReinterment: 'Δt_reinter: 140 ms',
      guaranteedInvariant: 'True Fill-Level Inspection Accuracy > 99.999%'
    }
  },
  {
    id: 'KO-SYS-10',
    systemName: 'Automated Warehouse Pallet RFID Transponder Loop (ISO 18000-6C)',
    entity: 'Coca-Cola',
    facility: 'Regional Distribution Hub (College Park, GA)',
    severity: 'medium',
    anomalyTitle: 'Replay Transponder Sequence Detected on European Concentrate Consignments',
    ts: new Date(Date.now() - 230000).toISOString(),
    url: 'https://supplychainsecurity.org/threats/ko-rfid-tamper',
    siMetrics: 'Carrier: 915.000 MHz · RSSI: -64.2 dBm · Crypto Auth: 18.4 µs · ECC: secp256r1',
    identifyingMethodology: 'Non-monotonic EPC sequence audit + ECDSA signature verification failure trap',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Hardware ECDSA signature verification enforced at conveyor speed (18.4 µs budget)',
      timeToReinterment: 'Δt_reinter: 18.4 µs',
      guaranteedInvariant: 'Physical Freight Provenance Cryptographically Guaranteed'
    }
  },
  {
    id: 'KO-SYS-11',
    systemName: 'Industrial Reverse Osmosis Water Treatment Pressure Loop',
    entity: 'Coca-Cola',
    facility: 'Water Stewardship Facility (Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'Membrane Differential Pressure Sensor Micro-Cavitation Fluctuation',
    ts: new Date(Date.now() - 290000).toISOString(),
    url: 'https://ics-cert.us-cert.gov/advisories/ko-water-ro',
    siMetrics: 'Pressure: 1,380 kPa (200 psi) · Flow: 42.0 L/s · Conductivity: 12.4 µS/cm',
    identifyingMethodology: 'High-frequency piezoelectric acoustic sensor detecting cavitation vibration signatures (45 kHz)',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Variable Frequency Drive (VFD) pump speed back-off and automated forward flush cycle',
      timeToReinterment: 'Δt_reinter: 2.4 s',
      guaranteedInvariant: 'Feed Water Purity Metric < 15 µS/cm Maintained'
    }
  },
  {
    id: 'KO-SYS-12',
    systemName: 'High-Pressure Liquid CO2 Carbonation Modbus Regulators',
    entity: 'Coca-Cola',
    facility: 'Bottling Carbonation Grid (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'Carbonation Ratio PID Controller Oscillation on Mass Flow Transducer',
    ts: new Date(Date.now() - 350000).toISOString(),
    url: 'https://ics-cert.us-cert.gov/advisories/ko-co2-pressure',
    siMetrics: 'Temp: 275.15 K (2°C) · Pressure: 345 kPa · Gas Vol: 3.85 ± 0.02 vol/vol',
    identifyingMethodology: 'Lyapunov Exponent Stability Analysis on PID error divergence vector',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'PID loop gain auto-tuning clamp damping proportional gain to prevent pressure hammer',
      timeToReinterment: 'Δt_reinter: 60 ms',
      guaranteedInvariant: 'Beverage Dissolved CO2 Maintained at 3.85 vol/vol'
    }
  },

  // THE HOME DEPOT (6 Systems)
  {
    id: 'HD-SYS-13',
    systemName: 'Locust Grove DC Autonomous Mobile Robot (AMR) Kinematic Grid',
    entity: 'Home Depot',
    facility: 'Locust Grove Fulfillment Center (Henry County, GA)',
    severity: 'high',
    anomalyTitle: 'Inertial Measurement Unit (IMU) Odometry Drift during Fiducial Occlusion',
    ts: new Date(Date.now() - 50000).toISOString(),
    url: 'https://robotics-safety.org/advisories/amr-kinematics-hd',
    siMetrics: 'Sort Rate: 14,200 units/hr · Pos Accuracy: ±1.8 mm · PTP Sync: ±4.2 ps · Velocity: 2.4 m/s',
    identifyingMethodology: 'Extended Kalman Filter (EKF) covariance threshold exceedance (P_cov > 0.08 m²)',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Sub-nanosecond IEEE 1588 PTP time resynchronization and lidar scan-matching fallback',
      timeToReinterment: 'Δt_reinter: 120 µs',
      guaranteedInvariant: 'Zero Collision Kinematic Envelope Guaranteed'
    }
  },
  {
    id: 'HD-SYS-14',
    systemName: 'Regional Store Cassandra Checkout Reservation Cluster',
    entity: 'Home Depot',
    facility: 'Enterprise Cloud Datacenter (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'Stale Read Window on Store WAN Partition inducing Phantom SKU Oversell',
    ts: new Date(Date.now() - 120000).toISOString(),
    url: 'https://otx.alienvault.com/pulse/ga-homedepot-race',
    siMetrics: 'Throughput: 18.4 kops/s · Consistency: LOCAL_QUORUM · Mut Jitter: 120 ps · Lock: 2.4 ms',
    identifyingMethodology: 'Distributed vector clock divergence detector during WAN packet drops',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_FAILOVER_ENGAGED',
      reintermentMethod: 'Distributed Redlock consensus algorithm with strict QUORUM consistency override',
      timeToReinterment: 'Δt_reinter: 2.4 ms',
      guaranteedInvariant: 'Zero Oversell Invariant on 2,300+ Store Ledger'
    }
  },
  {
    id: 'HD-SYS-15',
    systemName: 'ProXtra Net-60 Commercial Credit Underwriting API',
    entity: 'Home Depot',
    facility: 'Financial Technologies Desk (Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'Contractor Revolving Credit CECL Loss Provisioning Calculation Skew',
    ts: new Date(Date.now() - 180000).toISOString(),
    url: 'https://sec.gov/edgar/browse/?CIK=0000354950',
    siMetrics: 'Credit Volume: $2.4B/year · Latency: 420 µs · Loss Reserve: 1.84% · CECL Sync: 100%',
    identifyingMethodology: 'Monte Carlo Stress Test divergence against Federal Reserve macroeconomic scenarios',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_HSM_LOCKED',
      reintermentMethod: 'Automated real-time risk re-weighting pipeline under GAAP ASC 326',
      timeToReinterment: 'Δt_reinter: 420 ms',
      guaranteedInvariant: 'Statutory Credit Reserve Parity Enforced'
    }
  },
  {
    id: 'HD-SYS-16',
    systemName: 'Point-of-Sale Level-3 Merchant Interchange Routing Switch',
    entity: 'Home Depot',
    facility: 'Store POS Network Core (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'Missing Line-Item Commodity Code Downgrade on Commercial Purchases',
    ts: new Date(Date.now() - 240000).toISOString(),
    url: 'https://sec.gov/edgar/browse/?CIK=0000354950',
    siMetrics: 'POS Rate: 38,000 tx/min · Interchange Margin: 72 bps · Settlement: 420 ms',
    identifyingMethodology: 'ISO 8583 Bit 63 Private Data Field completeness validator',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Automated Level-3 line-item payload injection at payment switch level',
      timeToReinterment: 'Δt_reinter: 12.0 ms',
      guaranteedInvariant: 'Recovers 72 bps Commercial Interchange Fee'
    }
  },
  {
    id: 'HD-SYS-17',
    systemName: 'Store Self-Checkout Kiosk Chromium Sandbox Controller',
    entity: 'Home Depot',
    facility: 'Store Technology Lab (Cobb County, GA)',
    severity: 'medium',
    anomalyTitle: 'Chromium Renderer Sandbox IPC Pipe Saturation on Multitouch Input',
    ts: new Date(Date.now() - 300000).toISOString(),
    url: 'https://otx.alienvault.com/pulse/ga-homedepot-kiosk',
    siMetrics: 'IPC Latency: 1.2 ms · Memory Cap: 512 MB · Drop Rate: 0 ppm · Frame Rate: 60 fps',
    identifyingMethodology: 'Linux cgroups memory and IPC pipe buffer depth polling',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Automated renderer process cgroup memory pruning and thread affinity pinning',
      timeToReinterment: 'Δt_reinter: 48 ms',
      guaranteedInvariant: 'Kiosk Responsive UI Guaranteed with Zero Freeze'
    }
  },
  {
    id: 'HD-SYS-18',
    systemName: 'Regional Distribution Center Automated Forklift LiDAR Safety Mesh',
    entity: 'Home Depot',
    facility: 'Savannah Logistics Gateway (Chatham County, GA)',
    severity: 'high',
    anomalyTitle: 'LiDAR Optical Refraction Ghosting in High-Humidity Pallet Stacks',
    ts: new Date(Date.now() - 360000).toISOString(),
    url: 'https://robotics-safety.org/advisories/forklift-lidar-hd',
    siMetrics: 'Range: 30.0 m · Accuracy: ±5.0 mm · Wavelength: 905 nm · Scan: 25 Hz',
    identifyingMethodology: 'Statistical Outlier Removal (SOR) point cloud filter tracking phantom obstacle clustering',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Multi-echo dual-pulse LiDAR filtering suppressing ambient atmospheric water reflections',
      timeToReinterment: 'Δt_reinter: 40 ms',
      guaranteedInvariant: 'Automated Forklift Brake Margin Verified at 1.5 m'
    }
  },

  // UNITED PARCEL SERVICE (6 Systems)
  {
    id: 'UPS-SYS-19',
    systemName: 'Worldport Sortation Matrix Modbus/TCP Secondary Diverter Loop',
    entity: 'UPS',
    facility: 'Worldport Transit Core (Sandy Springs, GA)',
    severity: 'critical',
    anomalyTitle: 'Unauthorized PLC Modbus Write Function Code Injection on Diverter Coils',
    ts: new Date(Date.now() - 60000).toISOString(),
    url: 'https://ics-cert.us-cert.gov/advisories/ups-worldport-matrix',
    siMetrics: 'Throughput: 500,000 pkgs/hr · Speed: 3.2 m/s · Latency: 22 µs · BER < 10⁻¹²',
    identifyingMethodology: 'eBPF Traffic Control (TC) ingress hook validating Modbus Function Codes (rejects FC 0x05/0x06/0x10)',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_AIR_GAPPED',
      reintermentMethod: 'Hardware CIP Safety interlocking clamps PLC write access to authenticated keys only',
      timeToReinterment: 'Δt_reinter: 22 µs',
      guaranteedInvariant: 'Zero Unscheduled Carousel Halts on Air Express Loop'
    }
  },
  {
    id: 'UPS-SYS-20',
    systemName: 'DIAD VI Driver Handheld Cellular LTE-M Gateway',
    entity: 'UPS',
    facility: 'Mobile Telecommunications Grid (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'LTE-M Discontinuous Reception (eDRX) Wake-Up Timing Desync in Dense Metro Core',
    ts: new Date(Date.now() - 130000).toISOString(),
    url: 'https://cisa.gov/known-exploited-vulnerabilities-catalog',
    siMetrics: 'Latency: 140 ms · RSRP: -92 dBm · Packet Loss: 0.002% · Battery Life: 18.4 hrs',
    identifyingMethodology: 'Cellular Baseband Diagnostic Buffer Analysis tracking NAS Signaling RTT spikes',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_FAILOVER_ENGAGED',
      reintermentMethod: 'Automated carrier dual-eSIM failover to Verizon/AT&T private APN slice',
      timeToReinterment: 'Δt_reinter: 850 ms',
      guaranteedInvariant: 'Continuous Real-Time Delivery Signature Uplink'
    }
  },
  {
    id: 'UPS-SYS-21',
    systemName: 'Delivery Fleet CAN-bus J1939 Telematics Telemetry Ingress',
    entity: 'UPS',
    facility: 'Fleet Maintenance Hub (Roswell, GA)',
    severity: 'medium',
    anomalyTitle: 'OBD-II CAN-bus Arbitration Collision during Cold Weather Cold-Crank Ignition',
    ts: new Date(Date.now() - 190000).toISOString(),
    url: 'https://ics-cert.us-cert.gov/advisories/ups-telematics',
    siMetrics: 'CAN Bitrate: 500.0 kbps · Bus Load: 48.2% · Error Frames: 0 · Temp: 268.15 K (-5°C)',
    identifyingMethodology: 'CAN Controller Error Passive Counter threshold detector (TEC > 128)',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Microcontroller hardware priority re-masking reserving Message ID 0x18FEEE00',
      timeToReinterment: 'Δt_reinter: 2.0 ms',
      guaranteedInvariant: 'Engine Diagnostic & Brake Telemetry Bus Pristine'
    }
  },
  {
    id: 'UPS-SYS-22',
    systemName: 'Automated Parcel Tilt-Tray Carousel Speed Governor',
    entity: 'UPS',
    facility: 'Atlanta Hub (Fulton County, GA)',
    severity: 'medium',
    anomalyTitle: 'Rotary Optical Encoder Quadrature Phase Jitter on Primary Drive Shaft',
    ts: new Date(Date.now() - 250000).toISOString(),
    url: 'https://ics-cert.us-cert.gov/advisories/ups-encoder',
    siMetrics: 'Speed: 2.80 m/s · Line Resolution: 4,096 PPR · Angular Jitter: 12.0 ps',
    identifyingMethodology: 'Quadrature Phase Error Phase Locked Loop (PLL) tracking phase error > 15°',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Digital notch filter on motor VFD drive inverter damping mechanical resonance',
      timeToReinterment: 'Δt_reinter: 35 ms',
      guaranteedInvariant: 'Tilt Tray Position Accuracy < 2.0 mm at Divert Pin'
    }
  },
  {
    id: 'UPS-SYS-23',
    systemName: 'International Air Cargo Customs Escrow SWIFT pacs.008 Clearing Switch',
    entity: 'UPS',
    facility: 'Air Freight Headquarters (Sandy Springs, GA)',
    severity: 'high',
    anomalyTitle: 'Customs Duty Harmonized Tariff Code Schema Discrepancy on European Air Freight',
    ts: new Date(Date.now() - 310000).toISOString(),
    url: 'https://sec.gov/edgar/browse/?CIK=0001090727',
    siMetrics: 'Throughput: 18.5 kmsg/s · Clearing: 180 ms · Tariff Accuracy: 100% · Float: $85M',
    identifyingMethodology: 'XML Schema Definition (XSD) ISO 20022 automated semantic validator',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_HSM_LOCKED',
      reintermentMethod: 'Automated CBP commercial environment cryptographic validation ledger',
      timeToReinterment: 'Δt_reinter: 180 ms',
      guaranteedInvariant: 'Zero Cargo Customs Detention Surcharges'
    }
  },
  {
    id: 'UPS-SYS-24',
    systemName: 'Aircraft Weight & Balance Unit (WBU) ARINC 429 Bus',
    entity: 'UPS',
    facility: 'Aviation Maintenance Facility (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'Cargo Pallet Weight Sensor Strain Gauge Thermal Drift on Main Deck Loader',
    ts: new Date(Date.now() - 370000).toISOString(),
    url: 'https://aviation-isac.org/bulletins/ups-wbu',
    siMetrics: 'Max Cargo: 108,000 kg · Scale Accuracy: ±10 kg · Wheatstone Bridge: 5.0 V excitation',
    identifyingMethodology: 'Dual Wheatstone bridge resistance differential monitoring with temperature compensation',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Automatic tare calibration routine zeroing strain gauge offset against RTD temperature',
      timeToReinterment: 'Δt_reinter: 500 ms',
      guaranteedInvariant: 'Aircraft Center of Gravity (CG) Computed within 0.1% MAC'
    }
  },

  // SOUTHERN COMPANY / GEORGIA POWER (7 Systems)
  {
    id: 'SO-SYS-25',
    systemName: 'Plant Vogtle Unit 3 Westinghouse AP1000 Digital Instrumentation Bus',
    entity: 'Southern Company',
    facility: 'Plant Vogtle Unit 3 (Waynesboro, Burke County, GA)',
    severity: 'critical',
    anomalyTitle: 'Protection and Safety Monitoring System (PMS) Triple Modular Redundancy Clock Skew',
    ts: new Date(Date.now() - 30000).toISOString(),
    url: 'https://nrc.gov/reactors/plant-vogtle-telemetry',
    siMetrics: 'Net Output: 1,117 MW · Bus: 500.0 kV · Freq: 60.000 Hz · Clock Skew: 9.2 ns · TVE: 0.042%',
    identifyingMethodology: 'Triple Modular Redundancy (TMR) Majority Voting Logic Hardware Comparator Slip',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_AIR_GAPPED',
      reintermentMethod: 'Automatic failover to redundant rubidium atomic Stratum-1 clock keeping TVE < 0.042%',
      timeToReinterment: 'Δt_reinter: 4.2 µs',
      guaranteedInvariant: 'NRC 10 CFR § 50 Appendix A Criterion 20 Protection System Integrity'
    }
  },
  {
    id: 'SO-SYS-26',
    systemName: 'Plant Vogtle Unit 4 Nuclear Reactor Control Rod Positioning SCADA',
    entity: 'Southern Company',
    facility: 'Plant Vogtle Unit 4 (Waynesboro, Burke County, GA)',
    severity: 'critical',
    anomalyTitle: 'Control Rod Drive Mechanism (CRDM) Step Counter Inductive Coil Fluctuation',
    ts: new Date(Date.now() - 85000).toISOString(),
    url: 'https://nrc.gov/reactors/plant-vogtle-crdm',
    siMetrics: 'Reactor Power: 100.0% · Rod Steps: 228 steps · Position Error: 0 steps · Jitter: 12 ps',
    identifyingMethodology: 'Linear Variable Differential Transformer (LVDT) coil impedance phase monitoring',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_AIR_GAPPED',
      reintermentMethod: 'Hardware interlock holding rod banks in current step; secondary analog detector confirmation',
      timeToReinterment: 'Δt_reinter: 10.0 ms',
      guaranteedInvariant: 'Axial Flux Difference Kept within Technical Specifications'
    }
  },
  {
    id: 'SO-SYS-27',
    systemName: '500 kV Bulk Transmission Interconnection Synchrophasor PMU Bus',
    entity: 'Southern Company',
    facility: 'North Georgia Substation Hub (Cherokee County, GA)',
    severity: 'high',
    anomalyTitle: 'IEEE C37.118 Synchrophasor Phase Angle Drift on Metro Interconnect',
    ts: new Date(Date.now() - 145000).toISOString(),
    url: 'https://nerc.com/pa/rrm/ea/Pages/PMU-drift-ga.aspx',
    siMetrics: 'Voltage: 500.0 kV · Phase Angle: 14.22° · TVE: 0.042% · Grid Frequency: 60.000 Hz',
    identifyingMethodology: 'Total Vector Error (TVE) mathematical threshold evaluation tracking deviations > 0.040%',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'PTP IEEE 1588 time sync lock re-establishment with GPS receiver multipath filtering',
      timeToReinterment: 'Δt_reinter: 4.2 µs',
      guaranteedInvariant: 'NERC Standard PRC-002-2 Phase Angle Accuracy Guaranteed'
    }
  },
  {
    id: 'SO-SYS-28',
    systemName: 'Substation RTU DNP3 Over TCP/IP Telemetry Bus',
    entity: 'Southern Company',
    facility: 'Atlanta Regional Grid Control (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'DNP3 Application Layer Fragment Sequence Desynchronization',
    ts: new Date(Date.now() - 205000).toISOString(),
    url: 'https://ics-cert.us-cert.gov/advisories/so-dnp3-rtu',
    siMetrics: 'Ingress: 12.4 kpps · Drop Rate: 0 ppm · DNP3 Port: 20000 · Response: 14.2 ms',
    identifyingMethodology: 'Stateful protocol inspection tracking out-of-order DNP3 sequence numbers',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Hardware firewall state reset enforcing DNP3 Secure Authentication (SAv5)',
      timeToReinterment: 'Δt_reinter: 14.2 ms',
      guaranteedInvariant: 'Substation Breaker Remote Control Determinism'
    }
  },
  {
    id: 'SO-SYS-29',
    systemName: 'Combined-Cycle Natural Gas Turbine Thermodynamic SCADA',
    entity: 'Southern Company',
    facility: 'Plant McDonough-Atkinson (Cobb County, GA)',
    severity: 'medium',
    anomalyTitle: 'Combustion Turbine Exhaust Thermocouple Thermal Gradient Spike',
    ts: new Date(Date.now() - 265000).toISOString(),
    url: 'https://ics-cert.us-cert.gov/advisories/so-gas-turbine',
    siMetrics: 'Output: 840 MW · Exhaust Temp: 893.15 K (620°C) · Blade Jitter: 14 ps · Press: 1.8 MPa',
    identifyingMethodology: 'Statistical Thermal Gradient Spread Analysis across 24 circumferential thermocouples',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Fuel gas control valve trim adjustment re-balancing fuel-to-air ratio across combustor cans',
      timeToReinterment: 'Δt_reinter: 80 ms',
      guaranteedInvariant: 'Turbine Rotor Temperature Uniformity < 25 K Spread'
    }
  },
  {
    id: 'SO-SYS-30',
    systemName: 'Day-Ahead Locational Marginal Pricing (LMP) Energy Trading Engine',
    entity: 'Southern Company',
    facility: 'Energy Energy Trading Floor (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'Transmission Congestion Dual-Variable Shadow Price Inversion Anomaly',
    ts: new Date(Date.now() - 325000).toISOString(),
    url: 'https://sec.gov/edgar/browse/?CIK=0000092122',
    siMetrics: 'Load: 38,400 MW · LMP Spread: $14.20/MWh · Settlement: 85 ms · Notional: $340M',
    identifyingMethodology: 'Linear Programming Karush-Kuhn-Tucker (KKT) optimality condition violation detector',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_HSM_LOCKED',
      reintermentMethod: 'Financial Transmission Rights (FTR) automated hedge locking nodal price floor',
      timeToReinterment: 'Δt_reinter: 85 ms',
      guaranteedInvariant: 'Georgia PSC Rule 515 Fuel Cost Recovery Balance Preserved'
    }
  },
  {
    id: 'SO-SYS-31',
    systemName: 'Advanced Metering Infrastructure (AMI) Cellular Smart Grid Mesh',
    entity: 'Southern Company',
    facility: 'Statewide Metering Operations (Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'AMI Concentrator IPv6 6LoWPAN Mesh Routing Loop on Substation Feeder',
    ts: new Date(Date.now() - 385000).toISOString(),
    url: 'https://cisa.gov/known-exploited-vulnerabilities-catalog',
    siMetrics: 'Meters: 2.4M · Mesh Hops: 4.2 avg · Packet Delivery: 99.85% · Bitrate: 250 kbps',
    identifyingMethodology: 'RPL (Routing Protocol for Low-Power Networks) Rank Inversion Topology Checker',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'DODAG (Destination-Oriented Directed Acyclic Graph) local repair trigger',
      timeToReinterment: 'Δt_reinter: 1.2 s',
      guaranteedInvariant: 'Smart Meter Billing & Outage Telemetry Path Active'
    }
  },

  // EQUIFAX (6 Systems)
  {
    id: 'EFX-SYS-32',
    systemName: 'Multi-Cloud Cassandra ACRO Credit Score Ingestion Bus',
    entity: 'Equifax',
    facility: 'Peachtree Core Datacenter (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'Commit-Log NVMe Block I/O Writeback Contention on High-Throughput Batch Ingest',
    ts: new Date(Date.now() - 55000).toISOString(),
    url: 'https://otx.alienvault.com/pulse/ga-equifax-acro',
    siMetrics: 'Ingest: 42,500 kops/s · Fsync: <1.2 ms · Jitter: 32 ps · Availability: 99.999%',
    identifyingMethodology: 'eBPF kprobe/blk_account_io_done tracking NVMe write latency spikes > 2.0 ms',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Kernel O_DIRECT bypass with dedicated NVMe write queues eliminating page cache contention',
      timeToReinterment: 'Δt_reinter: 1.2 ms',
      guaranteedInvariant: 'FCRA 15 U.S.C. § 1681n Dispute Audit Record Durability'
    }
  },
  {
    id: 'EFX-SYS-33',
    systemName: 'Consumer Dispute Resolution e-OSCAR Inter-Bureau Gateway',
    entity: 'Equifax',
    facility: 'Compliance Operations Hub (Alpharetta, GA)',
    severity: 'high',
    anomalyTitle: 'FCRA 30-Day Statutory Dispute Window Queue Processing Latency Creep',
    ts: new Date(Date.now() - 115000).toISOString(),
    url: 'https://sec.gov/edgar/browse/?CIK=0000033185',
    siMetrics: 'Disputes: 140,000/day · SLA: 30 days · Sync Latency: 280 µs · Jitter: 14.5 ps',
    identifyingMethodology: 'Automated monotonic timestamp countdown tracking items within 48 hours of statutory deadline',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_FAILOVER_ENGAGED',
      reintermentMethod: 'Cryptographic automated priority escalation queue with immutable audit trail emission',
      timeToReinterment: 'Δt_reinter: 280 ms',
      guaranteedInvariant: 'Zero Statutory Compliance Default (Zero $1,000/Violation Penalties)'
    }
  },
  {
    id: 'EFX-SYS-34',
    systemName: 'Tri-Bureau Synchronous Credit File Locking API',
    entity: 'Equifax',
    facility: 'Consumer Security Services (Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'Cross-Bureau Distributed Two-Phase Commit (2PC) Prepare-Phase Timeout',
    ts: new Date(Date.now() - 175000).toISOString(),
    url: 'https://equifax.com/security/consumer-freeze-api',
    siMetrics: 'Freeze Tx: 82,000/day · 2PC Latency: 48 ms · Success Rate: 99.998%',
    identifyingMethodology: 'Two-phase commit coordinator timeout monitor detecting participant non-response at 50 ms',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_HSM_LOCKED',
      reintermentMethod: 'Automated transaction rollback with compensating saga reconciliation on secondary channel',
      timeToReinterment: 'Δt_reinter: 52 ms',
      guaranteedInvariant: 'Consistent Consumer Credit Freeze State Guaranteed'
    }
  },
  {
    id: 'EFX-SYS-35',
    systemName: 'Identity Verification KYC Optical Character Recognition Engine',
    entity: 'Equifax',
    facility: 'AI Fraud Lab (Midtown Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'Driver License Hologram Diffraction Gradient Misclassification',
    ts: new Date(Date.now() - 235000).toISOString(),
    url: 'https://equifax.com/identity-verification/ocr-specs',
    siMetrics: 'OCR Latency: 320 ms · Resolution: 600 DPI · Confidence Floor: 98.5%',
    identifyingMethodology: 'Specular reflection gradient vector analysis rejecting synthetic generative image injection',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Multi-spectral infrared and ultraviolet channel verification fallback',
      timeToReinterment: 'Δt_reinter: 140 ms',
      guaranteedInvariant: 'USA PATRIOT Act Section 326 Customer Identification Compliance'
    }
  },
  {
    id: 'EFX-SYS-36',
    systemName: 'Consumer Credit Freeze Hardware Security Module (HSM) Vault',
    entity: 'Equifax',
    facility: 'Primary Key Management Facility (Atlanta, GA)',
    severity: 'critical',
    anomalyTitle: 'FIPS 140-3 Physical Chassis Tamper Sensor Thermal Differential Trigger',
    ts: new Date(Date.now() - 295000).toISOString(),
    url: 'https://csrc.nist.gov/projects/cryptographic-module-validation-program',
    siMetrics: 'Key: 4096-bit RSA · FIPS Level: Level 4 · Zeroization: <100 ns · Temp: 295.15 K',
    identifyingMethodology: 'Chassis interior micro-thermistor differential circuit monitoring',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_HSM_LOCKED',
      reintermentMethod: 'Zeroization suppression clamp verifying valid environmental HVAC sensor telemetry',
      timeToReinterment: 'Δt_reinter: 12.0 µs',
      guaranteedInvariant: 'Root Cryptographic Keys Shielded with Zero Key Compromise'
    }
  },
  {
    id: 'EFX-SYS-37',
    systemName: 'Real-Time Fraud Analytics Heterogeneous Graph Neural Engine',
    entity: 'Equifax',
    facility: 'Fraud Analytics Cloud (Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'Graph Neural Network (GNN) Synthetic Identity Cycle Ring Ingestion Spike',
    ts: new Date(Date.now() - 355000).toISOString(),
    url: 'https://equifax.com/analytics/graph-fraud-defense',
    siMetrics: 'Graph Size: 1.2B nodes · Inference: 14.8 ms · Ring Detection: 99.2%',
    identifyingMethodology: 'Tarjan Strongly Connected Components (SCC) algorithmic graph cycle detector',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_QUARANTINED',
      reintermentMethod: 'Automated credit file quarantine flagging synthetic social security number cluster',
      timeToReinterment: 'Δt_reinter: 28 ms',
      guaranteedInvariant: 'Synthetic Identity Fraud Syndicate Neutralized'
    }
  },

  // NCR VOYIX (6 Systems)
  {
    id: 'VYX-SYS-38',
    systemName: 'Retail POS Hardware DPDK Fast-Path EMV Kernel Sandbox',
    entity: 'NCR Voyix',
    facility: 'Point-of-Sale Development Lab (Spring St NW, Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'USB Optical Scanner Interrupt Storm delaying EMV Contactless Callback',
    ts: new Date(Date.now() - 65000).toISOString(),
    url: 'https://ncrvoyix.com/security/pos-kernel-hardening',
    siMetrics: 'POS Latency: 8.4 µs · Scan: 4,200 scans/min · Jitter: 6.2 ps · PCI: PCI-PTS 6.x',
    identifyingMethodology: 'Linux Hard IRQ latency profiler tracking CPU 0 interrupt handling delays > 15 ms',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'DPDK user-space thread isolation with dedicated CPU core pinning for EMV stream',
      timeToReinterment: 'Δt_reinter: 8.4 µs',
      guaranteedInvariant: 'EMV Payment Callback Completed < 100 ms PCI Mandate'
    }
  },
  {
    id: 'VYX-SYS-39',
    systemName: 'ATM Cash Dispenser Controller NDC+ Protocol Gateway',
    entity: 'NCR Voyix',
    facility: 'ATM Engineering Center (Duluth, GA)',
    severity: 'critical',
    anomalyTitle: 'Blackbox Serial Command Injection Attempt on Note Dispenser Firmware',
    ts: new Date(Date.now() - 125000).toISOString(),
    url: 'https://cisa.gov/known-exploited-vulnerabilities-catalog',
    siMetrics: 'Serial: RS-232 9600 baud · Firmware: Authenticode Signed · Crypto: AES-256-GCM',
    identifyingMethodology: 'Serial Protocol Command Grammar State Machine anomaly detector',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_AIR_GAPPED',
      reintermentMethod: 'Hardware cryptographic mutual authentication with physical cash cassette lockout',
      timeToReinterment: 'Δt_reinter: 1.2 ms',
      guaranteedInvariant: 'Zero Physical Currency Dispense Without Host Authorization'
    }
  },
  {
    id: 'VYX-SYS-40',
    systemName: 'Self-Checkout Platter Dual-Load Cell Scale I2C Bus',
    entity: 'NCR Voyix',
    facility: 'Retail Solutions Testing Center (Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'I2C Bus Capacitive Load Rise-Time Slew Rate Distortion',
    ts: new Date(Date.now() - 185000).toISOString(),
    url: 'https://ncrvoyix.com/retail/self-checkout-specs',
    siMetrics: 'I2C Clock: 400.0 kHz · Slew: 120 ns/V · Scale Accuracy: ±0.5 g · Weight Cap: 30.0 kg',
    identifyingMethodology: 'Analog-to-Digital Converter (ADC) bus voltage threshold transition timing monitor',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Dynamic programmable pull-up resistor adjustment on scale controller',
      timeToReinterment: 'Δt_reinter: 4.8 ms',
      guaranteedInvariant: 'Zero Shrinkage Item Weight Verification Maintained'
    }
  },
  {
    id: 'VYX-SYS-41',
    systemName: 'Merchant End-of-Day Acquiring Batch Settlement Gateway',
    entity: 'NCR Voyix',
    facility: 'Merchant Services Core (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'Durbin Amendment PIN-Debit Least-Cost Routing Misclassification',
    ts: new Date(Date.now() - 245000).toISOString(),
    url: 'https://sec.gov/edgar/browse/?CIK=0001965961',
    siMetrics: 'Volume: $1.8B/day · Margin Float: 14.5 bps · Switch Latency: 64 µs · Jitter: 9.8 ps',
    identifyingMethodology: 'Bank Identification Number (BIN) table lookup latency differential profiler',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'In-memory trie routing table update forcing least-cost network (Pulse/Star/NYCE)',
      timeToReinterment: 'Δt_reinter: 64 µs',
      guaranteedInvariant: 'Saves 14.5 bps Commercial Debit Interchange'
    }
  },
  {
    id: 'VYX-SYS-42',
    systemName: 'Quick-Service Restaurant Kitchen Display System (KDS) MQTT Broker',
    entity: 'NCR Voyix',
    facility: 'Hospitality Cloud Core (Atlanta, GA)',
    severity: 'medium',
    anomalyTitle: 'MQTT QoS-2 Packet Ingress Buffer Flooding on Drive-Thru Lunch Peak',
    ts: new Date(Date.now() - 305000).toISOString(),
    url: 'https://ncrvoyix.com/hospitality/kds-architecture',
    siMetrics: 'Orders: 24,000 orders/min · MQTT QoS: QoS-2 · Broker Latency: 4.2 ms',
    identifyingMethodology: 'Token bucket leaky rate queue depth threshold detector (> 80% capacity)',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Dynamic client connection backpressure and order priority queue rebalancing',
      timeToReinterment: 'Δt_reinter: 18 ms',
      guaranteedInvariant: 'Kitchen Order Display Latency Kept < 250 ms'
    }
  },
  {
    id: 'VYX-SYS-43',
    systemName: 'Petroleum Dispenser Forecourt Controller IFSF Protocol Loop',
    entity: 'NCR Voyix',
    facility: 'Convenience Retail Testing Lab (Alpharetta, GA)',
    severity: 'high',
    anomalyTitle: 'International Forecourt Standards Forum (IFSF) Pump Pulser Pulse Count Desync',
    ts: new Date(Date.now() - 365000).toISOString(),
    url: 'https://ncrvoyix.com/petroleum/forecourt-specs',
    siMetrics: 'Pulse Rate: 1,000 pulses/gal · Flow: 10.0 gal/min · Accuracy: ±0.001 gal',
    identifyingMethodology: 'Quadrature dual-pulser phase verification algorithm detecting mechanical slippage',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Electronic solenoid valve emergency cutoff clamping pump flow immediately',
      timeToReinterment: 'Δt_reinter: 15 ms',
      guaranteedInvariant: 'NIST Handbook 44 Weights and Measures Legal Metering Compliance'
    }
  },

  // AFLAC (4 Systems)
  {
    id: 'AFL-SYS-44',
    systemName: 'Supplemental Medical Claims HL7 FHIR REST API Gateway',
    entity: 'Aflac',
    facility: 'Corporate Technology Headquarters (Columbus, Muscogee County, GA)',
    severity: 'high',
    anomalyTitle: 'FHIR Observation Resource Out-of-Scope Diagnostic Code Query Attempt',
    ts: new Date(Date.now() - 70000).toISOString(),
    url: 'https://aflac.com/security/fhir-opa-defense',
    siMetrics: 'Policy Decision: 85 µs · Jitter: 12.0 ps · Scope Accuracy: 100% · Throughput: 18.4 kops/s',
    identifyingMethodology: 'HTTP Authorization Bearer token claim to resource URI parameter mismatch detector',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Open Policy Agent (OPA) fine-grained Rego rule enforcement blocking unauthorized query',
      timeToReinterment: 'Δt_reinter: 85 µs',
      guaranteedInvariant: 'HIPAA Title II Confidentiality & Zero Scope Escalation'
    }
  },
  {
    id: 'AFL-SYS-45',
    systemName: 'Open Policy Agent (OPA) Attribute-Based Access Control Engine',
    entity: 'Aflac',
    facility: 'Cybersecurity Operations Center (Columbus, GA)',
    severity: 'medium',
    anomalyTitle: 'Rego Policy Compilation Bytecode Cache Invalidation Stalling Auth Decision',
    ts: new Date(Date.now() - 135000).toISOString(),
    url: 'https://aflac.com/security/abac-rego-specs',
    siMetrics: 'Decision Latency: 85 µs · Cache Hit: 99.98% · Invalidation Rate: 0.002%',
    identifyingMethodology: 'OPA decision log latency histogram tracking P99 tail latency spikes > 2.0 ms',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Pre-compiled WebAssembly (Wasm) policy module hot-reloading with atomic swap',
      timeToReinterment: 'Δt_reinter: 1.4 ms',
      guaranteedInvariant: 'Sub-100 µs Policy Decision Guarantee Active'
    }
  },
  {
    id: 'AFL-SYS-46',
    systemName: 'DuckChat Customer Claims Web Portal WebSocket Bridge',
    entity: 'Aflac',
    facility: 'Digital Experience Hub (Columbus, GA)',
    severity: 'medium',
    anomalyTitle: 'WebSocket Permessage-Deflate Compression Bomb Denial of Service Attempt',
    ts: new Date(Date.now() - 195000).toISOString(),
    url: 'https://aflac.com/security/claims-portal-hardening',
    siMetrics: 'Decompression Ratio: 1,024:1 · Frame Cap: 64 kB · Memory Clamp: 128 MB',
    identifyingMethodology: 'Streaming zlib decompression expansion ratio monitor tracking ratio > 50:1',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'WebSocket connection RST injection and client IP temporary rate-limit jail',
      timeToReinterment: 'Δt_reinter: 2.1 ms',
      guaranteedInvariant: 'Claims Portal Gateway Memory Stability Preserved'
    }
  },
  {
    id: 'AFL-SYS-47',
    systemName: 'Japan Dual-Currency JPY/USD Asset-Liability Solvency Matching Engine',
    entity: 'Aflac',
    facility: 'Global Investment & Treasury Operations (Columbus, GA / Tokyo)',
    severity: 'high',
    anomalyTitle: 'Bank of Japan (BOJ) Overnight Call Rate Shift inducing Cross-Currency Basis Variance',
    ts: new Date(Date.now() - 255000).toISOString(),
    url: 'https://sec.gov/edgar/browse/?CIK=0000004977',
    siMetrics: 'Portfolio: $115B · SMR: 784.2% · JPY Swap Hedge: 99.8% · Latency: 140 µs',
    identifyingMethodology: 'Japan FSA Solvency Margin Ratio (SMR) formula variance tracking < 720%',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_HSM_LOCKED',
      reintermentMethod: 'Automated dynamic cross-currency interest rate swap rebalancing overlay program',
      timeToReinterment: 'Δt_reinter: 140 ms',
      guaranteedInvariant: 'Japan FSA Solvency Margin Ratio Maintained > 700%'
    }
  },

  // GEORGIA TECHNOLOGY AUTHORITY & STATE CORE (3 Systems)
  {
    id: 'GTA-SYS-48',
    systemName: 'Statewide Single Sign-On (SSO) SAML 2.0 / OAuth Identity Federation Gateway',
    entity: 'Georgia Technology Authority',
    facility: 'State Computer Center (Atlanta, GA)',
    severity: 'high',
    anomalyTitle: 'SAML Assertion Clock Skew Relay-State Replay Vector Targeting State Agencies',
    ts: new Date(Date.now() - 75000).toISOString(),
    url: 'https://gta.georgia.gov/security/statewide-sso-hardening',
    siMetrics: 'Auth Rate: 480,000/hr · Latency: 12.4 ms · Jitter: 48 ps · Replay Drop: 100%',
    identifyingMethodology: 'eBPF socket buffer transient nonce lookup table tracking seen assertion hashes',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Strict 60-second monotonic timestamp envelope with cryptographic nonce invalidation',
      timeToReinterment: 'Δt_reinter: 12.4 ms',
      guaranteedInvariant: 'Zero Credential Replay Across All 68 Georgia State Agencies'
    }
  },
  {
    id: 'GTA-SYS-49',
    systemName: 'Georgia Cyber Center Coherent Optical Transponder DWDM Backbone',
    entity: 'Georgia Technology Authority',
    facility: 'Georgia Cyber Center (Augusta, Richmond County, GA)',
    severity: 'medium',
    anomalyTitle: 'Coherent Optical Dual-Polarization Phase Slip on Augusta-Atlanta Fiber Trunk',
    ts: new Date(Date.now() - 140000).toISOString(),
    url: 'https://gta.georgia.gov/cyber-center/dwdm-optical',
    siMetrics: 'Wavelength: 1550.12 nm · Optical SNR: 28.4 dB · Switch Time: 17.8 ms · BER: 10⁻¹⁵',
    identifyingMethodology: 'Digital Signal Processor (DSP) Carrier Phase Recovery (CPR) cycle slip counter',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_FAILOVER_ENGAGED',
      reintermentMethod: 'Automatic optical Protection Switching (APS) to diverse Southern Georgia fiber path',
      timeToReinterment: 'Δt_reinter: 17.8 ms',
      guaranteedInvariant: 'Uninterrupted 100 Gbps State Core Backbone'
    }
  },
  {
    id: 'GTA-SYS-50',
    systemName: 'Statewide 800 MHz APCO P25 Public Safety Digital Radio Trunking Gateway',
    entity: 'Georgia Technology Authority',
    facility: 'Georgia Public Safety Training Center (Forsyth, Monroe County, GA)',
    severity: 'high',
    anomalyTitle: 'Project 25 Digital Voice IP Backhaul Jitter during Severe Storm Concurrency Surge',
    ts: new Date(Date.now() - 200000).toISOString(),
    url: 'https://dps.georgia.gov/communications/p25-trunking',
    siMetrics: 'Voice Jitter: <2.5 ms · Loss: 0.000% · Priority Bandwidth: 40% · Latency: 14 ms',
    identifyingMethodology: 'RTP stream packet inter-arrival time variance analyzer (RFC 3550)',
    reintermentWorkflow: {
      reintermentState: 'REINTERRED_KERNEL_CLAMPED',
      reintermentMethod: 'Cisco IOS-XE DSCP Expedited Forwarding (EF) queue reservation reserving 40% bandwidth',
      timeToReinterment: 'Δt_reinter: 14.0 ms',
      guaranteedInvariant: 'Statewide First Responder Voice Comms Zero Jitter'
    }
  }
];
