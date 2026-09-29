import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { supabase } from './src/lib/supabase';
import { fetchMyEmployeeProfile, EmployeeProfile } from './src/services/employeeIdentity';

export default function App() {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setLoading(true);
      setErrorText('');

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          if (active) setLoading(false);
          return;
        }

        const employee = await fetchMyEmployeeProfile();

        if (active) {
          setProfile(employee);
          setLoading(false);
        }
      } catch (error) {
        if (active) {
          setErrorText(error instanceof Error ? error.message : 'Unable to load employee profile.');
          setLoading(false);
        }
      }
    }

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        if (active) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      try {
        const employee = await fetchMyEmployeeProfile();
        if (active) setProfile(employee);
      } catch (error) {
        if (active) {
          setErrorText(error instanceof Error ? error.message : 'Unable to load employee profile.');
        }
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.brand}>AMANAH</Text>
        <Text style={styles.title}>Driver & Operator Mobile</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.info}>Loading employee profile...</Text>
          </View>
        ) : errorText ? (
          <Text style={styles.error}>{errorText}</Text>
        ) : profile ? (
          <View style={styles.card}>
            <Text style={styles.welcome}>Welcome</Text>
            <Text style={styles.name}>{profile.employee_name}</Text>
            <Text style={styles.meta}>{profile.position ?? 'Employee'}</Text>
            <Text style={styles.meta}>Employee ID: {profile.employee_id}</Text>
            <Text style={styles.note}>Identity comes from the signed-in account. No employee selection is used.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.name}>Sign-in screen will be added next.</Text>
            <Text style={styles.note}>
              This foundation intentionally does not create employee activity assignment yet.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7fb' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  brand: { fontSize: 28, fontWeight: '800', letterSpacing: 2, color: '#111827' },
  title: { marginTop: 6, fontSize: 18, color: '#475569', marginBottom: 24 },
  center: { alignItems: 'center', gap: 12 },
  info: { color: '#64748b' },
  error: { color: '#b91c1c', lineHeight: 22 },
  card: { backgroundColor: '#fff', padding: 22, borderRadius: 18, elevation: 2 },
  welcome: { fontSize: 14, color: '#64748b' },
  name: { marginTop: 4, fontSize: 23, fontWeight: '700', color: '#111827' },
  meta: { marginTop: 6, fontSize: 15, color: '#475569' },
  note: { marginTop: 16, fontSize: 14, lineHeight: 21, color: '#64748b' }
});
