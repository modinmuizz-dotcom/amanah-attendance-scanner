import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { supabase } from './src/lib/supabase';
import { EmployeeProfile, fetchMyEmployeeProfile } from './src/services/employeeIdentity';
import { ApprovedActivity, Equipment, fetchActiveEquipment, fetchApprovedActivities } from './src/services/approvedActivities';

type Screen = 'home' | 'approved' | 'profile' | 'clockin';

const STATION = {
  type: 'AMANAH_ATTENDANCE_V1',
  company: 'AMANAH CONSTRUCTION',
  system: 'AMANAH CONSTRUCTION MANAGEMENT SYSTEM',
  station: 'MAIN_ATTENDANCE',
  version: 1,
};

function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, secondary ? styles.buttonSecondary : styles.buttonPrimary, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('modinmuizz@gmail.com');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      Alert.alert('Sign in failed', error.message);
      return;
    }
    onDone();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.login}>
        <Text style={styles.brand}>AMANAH</Text>
        <Text style={styles.eyebrow}>FIELD OPERATIONS</Text>
        <Text style={styles.title}>Driver & Operator Mobile</Text>
        <Text style={styles.muted}>Sign in with the company Supabase account. The employee profile is detected automatically.</Text>
        <View style={styles.card}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry style={styles.input} />
          <Button title={busy ? 'SIGNING IN...' : 'SIGN IN'} onPress={signIn} disabled={busy || !password} />
        </View>
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

function ActivityCard({ item }: { item: ApprovedActivity }) {
  const start = item.scheduled_start ? new Date(item.scheduled_start) : null;
  return (
    <View style={styles.activity}>
      <View style={styles.row}>
        <Text style={styles.activityDate}>{start ? start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : item.activity_date}</Text>
        <Text style={styles.priority}>{item.priority}</Text>
      </View>
      <Text style={styles.activityTitle}>{item.activity}</Text>
      {item.activity_item ? <Text style={styles.activityItem}>{item.activity_item}</Text> : null}
      <Text style={styles.project}>{item.project_name}</Text>
      <Text style={styles.meta}>Equipment: {item.equipment_name}</Text>
      <Text style={styles.meta}>
        {start ? start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Time TBD'}
        {item.scheduled_end ? ' – ' + new Date(item.scheduled_end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
      </Text>
      {item.activity_quantity != null ? <Text style={styles.meta}>Quantity: {Number(item.activity_quantity).toLocaleString()}</Text> : null}
      <Text style={styles.approved}>APPROVED FOR THIS EQUIPMENT</Text>
    </View>
  );
}

function Approved({ equipment, selected, setSelected }: { equipment: Equipment[]; selected: string; setSelected: (id: string) => void }) {
  const [items, setItems] = useState<ApprovedActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(id: string) {
    setSelected(id);
    setLoading(true);
    setError('');
    try {
      setItems(await fetchApprovedActivities(id || null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load approved activities.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(selected); }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>UPCOMING APPROVED WORK</Text>
      <Text style={styles.title}>Next 7 Days</Text>
      <Text style={styles.muted}>Available before QR scanning. Filter by equipment to see its approved upcoming work.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>EQUIPMENT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable onPress={() => load('')} style={[styles.chip, !selected && styles.chipSelected]}>
            <Text style={[styles.chipText, !selected && styles.chipTextSelected]}>ALL EQUIPMENT</Text>
          </Pressable>
          {equipment.map(e => (
            <Pressable key={e.equipment_id} onPress={() => load(e.equipment_id)} style={[styles.chip, selected === e.equipment_id && styles.chipSelected]}>
              <Text style={[styles.chipText, selected === e.equipment_id && styles.chipTextSelected]}>{e.equipment_name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator /></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorTitle}>Unable to load activities</Text><Text>{error}</Text><Button title="TRY AGAIN" onPress={() => load(selected)} secondary /></View> : null}
      {!loading && !error && items.length === 0 ? <View style={styles.card}><Text style={styles.cardTitle}>No approved activities</Text><Text style={styles.muted}>No approved work is scheduled for this equipment in the 7-day window.</Text></View> : null}
      {!loading && !error ? items.map(item => <ActivityCard key={item.activity_id} item={item} />) : null}
    </ScrollView>
  );
}

function Home({ employee, onApproved, onClockIn }: { employee: EmployeeProfile; onApproved: () => void; onClockIn: () => void }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>AMANAH · FIELD OPERATIONS</Text>
          <Text style={styles.title}>Good day, {employee.employee_name.split(' ')[0]}.</Text>
          <Text style={styles.muted}>{employee.position ?? 'Operator / Driver'}</Text>
        </View>
        <View style={styles.avatar}><Text style={styles.avatarText}>{employee.employee_name.slice(0, 1)}</Text></View>
      </View>

      <View style={styles.greenCard}>
        <Text style={styles.greenLabel}>CURRENT ATTENDANCE</Text>
        <Text style={styles.greenTitle}>Ready for a new shift?</Text>
        <Text style={styles.greenText}>Review approved work first. Scan the permanent station QR only when you are ready to clock in.</Text>
        <Button title="VIEW APPROVED ACTIVITIES" onPress={onApproved} />
        <Button title="SCAN & CLOCK IN" onPress={onClockIn} secondary />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Employee</Text>
        <Text style={styles.meta}>ID: {employee.employee_id}</Text>
        <Text style={styles.meta}>Department: {employee.department ?? '—'}</Text>
        <Text style={styles.meta}>Status: {employee.status}</Text>
      </View>
    </ScrollView>
  );
}

function ClockIn({ equipment, selected, setSelected, back }: { equipment: Equipment[]; selected: string; setSelected: (id: string) => void; back: () => void }) {
  const [verified, setVerified] = useState(false);
  const [items, setItems] = useState<ApprovedActivity[]>([]);

  async function chooseEquipment(id: string) {
    setSelected(id);
    setItems(await fetchApprovedActivities(id));
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={back}><Text style={styles.back}>‹ Back</Text></Pressable>
      <Text style={styles.eyebrow}>ATTENDANCE IN</Text>
      <Text style={styles.title}>Clock in</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Station check</Text>
        <Text style={styles.muted}>{Platform.OS === 'web' ? 'Web simulation mode.' : 'Native camera scanner.'}</Text>
        <Text style={styles.code}>{JSON.stringify(STATION)}</Text>
        {!verified ? <Button title="SIMULATE STATION SCAN" onPress={() => setVerified(true)} /> : <Text style={styles.success}>✓ MAIN_ATTENDANCE VERIFIED</Text>}
      </View>

      {verified ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Select equipment</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {equipment.map(e => (
              <Pressable key={e.equipment_id} onPress={() => chooseEquipment(e.equipment_id)} style={[styles.chip, selected === e.equipment_id && styles.chipSelected]}>
                <Text style={[styles.chipText, selected === e.equipment_id && styles.chipTextSelected]}>{e.equipment_name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {selected ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Approved work for selected equipment</Text>
          {items.length ? items.map(item => <ActivityCard key={item.activity_id} item={item} />) : <Text style={styles.muted}>No approved activities for this equipment.</Text>}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Profile({ employee, signOut }: { employee: EmployeeProfile; signOut: () => void }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>MY ACCOUNT</Text>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{employee.employee_name}</Text>
        <Text style={styles.meta}>Employee ID: {employee.employee_id}</Text>
        <Text style={styles.meta}>Position: {employee.position ?? '—'}</Text>
        <Text style={styles.meta}>Department: {employee.department ?? '—'}</Text>
        <Text style={styles.meta}>Status: {employee.status}</Text>
        <Button title="SIGN OUT" onPress={signOut} secondary />
      </View>
    </ScrollView>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(false);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState<Screen>('home');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState('');

  async function hydrate() {
    const { data: { session: s } } = await supabase.auth.getSession();
    setSession(Boolean(s));
    if (s) {
      try {
        setError('');
        setEmployee(await fetchMyEmployeeProfile());
        setEquipment(await fetchActiveEquipment());
      } catch (e) {
        setEmployee(null);
        setError(e instanceof Error ? e.message : 'Employee profile could not be loaded.');
      }
    } else {
      setEmployee(null);
    }
    setReady(true);
  }

  useEffect(() => {
    hydrate();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => hydrate());
    return () => subscription.unsubscribe();
  }, []);

  if (!ready) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator /><Text>Connecting to AMANAH...</Text></View></SafeAreaView>;
  if (!session) return <Login onDone={hydrate} />;
  if (!employee) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.title}>Access not enabled</Text><Text style={styles.muted}>{error}</Text><Button title="SIGN OUT" onPress={() => supabase.auth.signOut()} secondary /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      {screen === 'home' ? <Home employee={employee} onApproved={() => setScreen('approved')} onClockIn={() => setScreen('clockin')} /> : null}
      {screen === 'approved' ? <Approved equipment={equipment} selected={selectedEquipment} setSelected={setSelectedEquipment} /> : null}
      {screen === 'clockin' ? <ClockIn equipment={equipment} selected={selectedEquipment} setSelected={setSelectedEquipment} back={() => setScreen('home')} /> : null}
      {screen === 'profile' ? <Profile employee={employee} signOut={() => supabase.auth.signOut()} /> : null}

      {screen !== 'clockin' ? (
        <View style={styles.nav}>
          <Pressable style={styles.navItem} onPress={() => setScreen('home')}><Text style={screen === 'home' ? styles.navActive : styles.navText}>Home</Text></Pressable>
          <Pressable style={styles.navItem} onPress={() => setScreen('approved')}><Text style={screen === 'approved' ? styles.navActive : styles.navText}>Approved</Text></Pressable>
          <Pressable style={styles.navItem} onPress={() => setScreen('profile')}><Text style={screen === 'profile' ? styles.navActive : styles.navText}>Profile</Text></Pressable>
        </View>
      ) : null}
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F4' },
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 100, gap: 14 },
  login: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  brand: { fontSize: 34, fontWeight: '900', letterSpacing: 4, color: '#145A3B' },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6, color: '#52806B' },
  title: { fontSize: 28, fontWeight: '800', color: '#10271D' },
  muted: { color: '#6C7A73', lineHeight: 20 },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, gap: 10, borderWidth: 1, borderColor: '#E1E9E4' },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#17251E' },
  label: { fontSize: 12, fontWeight: '800', color: '#527064', letterSpacing: 1.2 },
  input: { borderWidth: 1, borderColor: '#D2DED7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#FBFDFC' },
  button: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4, paddingHorizontal: 14 },
  buttonPrimary: { backgroundColor: '#145A3B' },
  buttonSecondary: { backgroundColor: '#E8F1EB' },
  buttonText: { color: '#FFF', fontWeight: '800' },
  buttonTextSecondary: { color: '#145A3B' },
  disabled: { opacity: 0.45 },
  greenCard: { backgroundColor: '#145A3B', borderRadius: 20, padding: 20, gap: 9 },
  greenLabel: { color: '#BFE6CF', fontWeight: '800', fontSize: 11, letterSpacing: 1.4 },
  greenTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  greenText: { color: '#E0EFE6', lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#D8EAE0', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#145A3B', fontSize: 19, fontWeight: '900' },
  nav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 66, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#DBE5DF', flexDirection: 'row' },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navText: { color: '#87938D', fontWeight: '700' },
  navActive: { color: '#145A3B', fontWeight: '900' },
  chip: { borderWidth: 1, borderColor: '#CEDAD2', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, marginRight: 8 },
  chipSelected: { backgroundColor: '#145A3B', borderColor: '#145A3B' },
  chipText: { color: '#4E6258', fontSize: 12, fontWeight: '800' },
  chipTextSelected: { color: '#FFF' },
  activity: { backgroundColor: '#FFF', borderRadius: 16, padding: 15, marginTop: 10, gap: 5, borderWidth: 1, borderColor: '#E2E9E4' },
  activityDate: { color: '#527064', fontWeight: '800', fontSize: 12 },
  priority: { color: '#A06016', fontWeight: '800', fontSize: 12 },
  activityTitle: { color: '#14231C', fontSize: 17, fontWeight: '800' },
  activityItem: { color: '#527064', fontWeight: '700' },
  project: { color: '#145A3B', fontWeight: '700' },
  meta: { color: '#67746D', lineHeight: 21 },
  approved: { color: '#145A3B', backgroundColor: '#EAF4EE', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, alignSelf: 'flex-start', fontSize: 10, fontWeight: '900', overflow: 'hidden' },
  error: { backgroundColor: '#FFF3F0', borderRadius: 16, padding: 16, gap: 8 },
  errorTitle: { color: '#A2382B', fontWeight: '800' },
  success: { color: '#145A3B', fontWeight: '900' },
  code: { backgroundColor: '#F4F7F5', borderRadius: 12, padding: 10, fontSize: 10, lineHeight: 14, color: '#5C6962' },
  back: { color: '#145A3B', fontWeight: '900', fontSize: 15 },
});
