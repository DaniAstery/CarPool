import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, Alert, ActivityIndicator } from 'react-native';

// Mock Data Arrays matching the Ethiopian Corridor Market (Summit - Megenagna - Mexico, etc.)
const MOCK_ON_DEMAND_PASSENGERS = [
  { id: 'pax-01', pickup: 'Semit (Total Station)', dropoff: 'Megenagna / Mexico', passengers: 1, reward: '500 ETB', surge: true, time: '2m ago' },
  { id: 'pax-02', pickup: 'Summit (CBE Hub)', dropoff: 'Goro / Bole Atlas', passengers: 1, reward: '450 ETB', surge: false, time: '5m ago' }
];

const MOCK_AGGREGATED_POOLS = [
  { id: 'pool-101', corridor: 'Summit → Megenagna → Mexico', seatsFilled: '2/3', status: 'MATCHED BUNDLE', estPayout: '1,000 ETB', distance: '1.2 km away' }
];

export default function CreateCorridorScreen() {
  // 'DEMAND' = Single passenger triggers, 'AGGREGATED' = 2+ passenger pairs ready
  const [activeTab, setActiveTab] = useState('DEMAND');
  
  // Simulation states for active driver jobs
  const [activeJob, setActiveJob] = useState(null);
  const [jobState, setJobState] = useState('NONE'); // 'NONE', 'INITIALIZED', 'FULFILLED'

  // Action Handler 1: Initializing an On-Demand Single Request
  const handleInitializeDemand = (paxRequest) => {
    setActiveJob({
      title: `${paxRequest.pickup} Corridor`,
      payout: paxRequest.reward,
      seats: '1/3',
      type: 'DEMAND_DRIVEN'
    });
    setJobState('INITIALIZED');
    Alert.alert(
      "Corridor Launched! ⚡",
      `You initialized the line from ${paxRequest.pickup}. Passenger has been claimed.\n\nLine status is now open on the network for secondary pool matches.`
    );
  };

  // Action Handler 2: Accepting an Aggregated Multi-Passenger Bundle
  const handleAcceptAggregatedPool = (pool) => {
    setActiveJob({
      title: pool.corridor,
      payout: pool.estPayout,
      seats: pool.seatsFilled,
      type: 'PRE_MATCHED'
    });
    setJobState('FULFILLED');
    Alert.alert(
      "Bundle Claimed! 🚗",
      `Multi-passenger bundle accepted for corridor:\n${pool.corridor}.\n\nProceed directly to the corridor hub pickup point.`
    );
  };

  // Action Handler 3: Simulating the 3rd Passenger jumping into an Initialized Route
  const handleSimulateThirdPassengerJoin = () => {
    if (!activeJob) return;
    setActiveJob(prev => ({
      ...prev,
      seats: '3/3',
      payout: '1,200 ETB (🔓 +200 ETB Bonus Locked)'
    }));
    setJobState('FULFILLED');
    Alert.alert("Bonus Active! 🎉", "A 3rd pooling passenger has joined your route pipeline. Your max payout bonus is secured!");
  };

  const handleResetSimulator = () => {
    setActiveJob(null);
    setJobState('NONE');
  };

  return (
    <View style={styles.container}>
      
      {/* 💳 ACTIVE WORKFLOW TRACKER DISPLAY */}
      {jobState !== 'NONE' && (
        <View style={[styles.statusBanner, jobState === 'FULFILLED' ? styles.bannerGreen : styles.bannerBlue]}>
          <View style={styles.bannerHeaderRow}>
            <Text style={styles.bannerTitle}>LIVE MANIFEST: {activeJob?.title}</Text>
            <Text style={styles.bannerSeatsBadge}>{activeJob?.seats} FILLED</Text>
          </View>
          <Text style={styles.bannerPayout}>Payout Pipeline: {activeJob?.payout}</Text>
          
          {jobState === 'INITIALIZED' && (
            <TouchableOpacity style={styles.simulationTriggerBtn} onPress={handleSimulateThirdPassengerJoin}>
              <Text style={styles.simBtnText}>🧪 SIMULATE 3rd PASSENGER JOINING VIA APP</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.resetBtn} onPress={handleResetSimulator}>
            <Text style={styles.resetBtnText}>Cancel / Reset Route State</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 🧭 SEGMENTED TAB CONTROLLER */}
      {jobState === 'NONE' && (
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'DEMAND' && styles.tabButtonActive]} 
            onPress={() => setActiveTab('DEMAND')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'DEMAND' && styles.tabButtonTextActive]}>
              On-Demand Broadcasts ({MOCK_ON_DEMAND_PASSENGERS.length})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'AGGREGATED' && styles.tabButtonActive]} 
            onPress={() => setActiveTab('AGGREGATED')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'AGGREGATED' && styles.tabButtonTextActive]}>
              Pre-Matched Pools ({MOCK_AGGREGATED_POOLS.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 📱 DASHBOARD DATA CARDS CANVAS */}
      {jobState === 'NONE' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          {/* TAB CONTENT: ON-DEMAND SINGLE PASSENGER TRIGGERS */}
          {activeTab === 'DEMAND' && (
            <View>
              <Text style={styles.sectionContextInfo}>
                Single demand markers broadcasting live. Initialize the corridor to bundle them with other incoming riders along the route strategy.
              </Text>
              {MOCK_ON_DEMAND_PASSENGERS.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.routeHeader}>📍 {item.pickup}</Text>
                    <Text style={styles.timestampText}>{item.time}</Text>
                  </View>
                  <Text style={styles.routeSubheader}>🏢 heading to: {item.dropoff}</Text>
                  
                  <View style={styles.metricsRow}>
                    <Text style={styles.paxMetric}>👤 {item.passengers} Passenger Waiting</Text>
                    {item.surge && <Text style={styles.surgeBadge}>🔥 HIGH SURGE DEMAND</Text>}
                  </View>
                  
                  <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => handleInitializeDemand(item)}>
                    <Text style={styles.actionBtnText}>⚡ INITIALIZE CORRIDOR ROUTE ({item.reward})</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* TAB CONTENT: AGGREGATED MULTI-PASSENGER POOLS */}
          {activeTab === 'AGGREGATED' && (
            <View>
              <Text style={styles.sectionContextInfo}>
                Pre-matched pairs meeting the minimum capacity requirements. Claim immediately to skip the matching phase and head to the corridor hub.
              </Text>
              {MOCK_AGGREGATED_POOLS.map((item) => (
                <View key={item.id} style={[styles.card, styles.aggregatedCardBorder]}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.routeHeader}>{item.corridor}</Text>
                    <View style={styles.capacityBadge}><Text style={styles.capacityBadgeText}>{item.seatsFilled} MATCHED</Text></View>
                  </View>
                  <Text style={styles.routeSubheader}>📍 Base Range: {item.distance}</Text>
                  <Text style={styles.payoutHighlightText}>Estimated Earnings Value: {item.estPayout}</Text>
                  
                  <TouchableOpacity style={[styles.actionBtnPrimary, { backgroundColor: '#16A34A' }]} onPress={() => handleAcceptAggregatedPool(item)}>
                    <Text style={styles.actionBtnText}>🚗 CLAIM PRE-MATCHED BUNDLE</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12161A' },
  scrollContent: { padding: 16 },
  
  // Tab Navigation Design System
  tabContainer: { flexDirection: 'row', backgroundColor: '#1E293B', padding: 6, margin: 16, borderRadius: 12 },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  tabButtonActive: { backgroundColor: '#38BDF8' },
  tabButtonText: { color: '#94A3B8', fontWeight: 'bold', fontSize: 13 },
  tabButtonTextActive: { color: '#12161A' },
  
  sectionContextInfo: { color: '#94A3B8', fontSize: 13, lineHeight: 18, marginBottom: 16, paddingHorizontal: 4 },
  
  // Premium Card Layout Block Styles
  card: { backgroundColor: '#1E252D', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#2C353F' },
  aggregatedCardBorder: { borderColor: '#38BDF8', borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  routeHeader: { color: '#FFF', fontSize: 16, fontWeight: 'bold', flex: 1, paddingRight: 8 },
  routeSubheader: { color: '#94A3B8', fontSize: 14, marginVertical: 4 },
  timestampText: { color: '#64748B', fontSize: 12 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  paxMetric: { color: '#38BDF8', fontWeight: '600', fontSize: 13 },
  surgeBadge: { backgroundColor: '#7C2D12', color: '#FFEDD5', fontSize: 11, fontWeight: 'bold', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, overflow: 'hidden' },
  capacityBadge: { backgroundColor: '#1E3A8A', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  capacityBadgeText: { color: '#60A5FA', fontWeight: 'bold', fontSize: 11 },
  payoutHighlightText: { color: '#34D399', fontSize: 15, fontWeight: '700', marginTop: 10 },
  
  actionBtnPrimary: { backgroundColor: '#3B82F6', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  actionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },

  // Live Manifest Workflow Banner Styles
  statusBanner: { padding: 20, margin: 16, borderRadius: 20, borderWidth: 1 },
  bannerBlue: { backgroundColor: '#1E3A8A', borderColor: '#3B82F6' },
  bannerGreen: { backgroundColor: '#064E3B', borderColor: '#22C55E' },
  bannerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bannerTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 16, flex: 1 },
  bannerSeatsBadge: { color: '#FFF', backgroundColor: 'rgba(0,0,0,0.3)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, fontSize: 11, fontWeight: 'bold' },
  bannerPayout: { color: '#38BDF8', fontSize: 18, fontWeight: '800', marginTop: 10 },
  simulationTriggerBtn: { backgroundColor: '#22C55E', padding: 14, borderRadius: 10, alignItems: 'center', marginVertical: 14 },
  simBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  resetBtn: { marginTop: 10, alignItems: 'center' },
  resetBtnText: { color: '#FCA5A5', fontSize: 13, textDecorationLine: 'underline' }
});