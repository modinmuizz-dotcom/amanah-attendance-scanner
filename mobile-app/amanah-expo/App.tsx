import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { supabase } from './src/lib/supabase';
import { EmployeeProfile, fetchMyEmployeeProfile } from './src/services/employeeIdentity';
import { ApprovedActivity, Equipment, fetchActiveEquipment, fetchApprovedActivities } from './src/services/approvedActivities';

type Screen = 'home' | 'approved' | 'profile' | 'clockin' | 'clockout';

type ActiveAttendance = {
  attendance_id: string;
  attendance_date: string;
  time_in: string;
  equipment_id: string | null;
  equipment_name: string | null;
  project_id: string | null;
  project_name: string | null;
  meter_type: string | null;
  meter_in: number | null;
  project_activity_id: string | null;
};

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

async function fetchActiveAttendance(employeeId: string): Promise<ActiveAttendance | null> {
  const { data, error } = await supabase
    .from('attendance')
    .select('attendance_id,attendance_date,time_in,equipment_id,equipment_name,project_id,project_name,project_activity_id,meter_type,meter_in')
    .eq('employee_id', employeeId)
    .eq('status', 'IN')
    .order('time_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as ActiveAttendance | null) ?? null;
}

type LiveActivity = {
  attendance_id: string;
  project_activity_id: string;
  equipment_id: string | null;
  equipment_name: string | null;
  project_id: string | null;
  project_name: string | null;
  activity: string;
  activity_item: string | null;
  description: string | null;
  planned_quantity: number | null;
  actual_quantity: number;
  photo_1_path: string | null;
  photo_2_path: string | null;
};

async function fetchLiveActivity(attendanceId: string, employeeId: string): Promise<LiveActivity> {
  const { data, error } = await supabase.rpc('get_mobile_active_activity', {
    p_attendance_id: attendanceId,
    p_employee_id: employeeId,
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Unable to load the active activity.');
  return data as LiveActivity;
}

async function saveLiveActivityProgress(
  attendanceId: string,
  employeeId: string,
  activityId: string,
  quantity: number,
  photo1Path: string | null = null,
  photo2Path: string | null = null,
) {
  const { data, error } = await supabase.rpc('save_mobile_activity_progress', {
    p_attendance_id: attendanceId,
    p_employee_id: employeeId,
    p_project_activity_id: activityId,
    p_quantity: quantity,
    p_photo_1_path: photo1Path,
    p_photo_2_path: photo2Path,
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Unable to save activity progress.');
  return data;
}

async function uploadActivityEvidence(uri: string, attendanceId: string, activityId: string, slot: 1 | 2) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const path = `attendance/${attendanceId}/${activityId}/activity_${slot}_${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('attendance-activity-evidence')
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw error;
  return path;
}

async function createEvidenceUrl(path: string | null) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('attendance-activity-evidence')
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

function LiveActivity({ employee, attendance }: { employee: EmployeeProfile; attendance: ActiveAttendance }) {
  const [live, setLive] = useState<LiveActivity | null>(null);
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [captureSlot, setCaptureSlot] = useState<1 | 2 | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [photo1Url, setPhoto1Url] = useState<string | null>(null);
  const [photo2Url, setPhoto2Url] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();

  async function load() {
    setLoading(true);
    try {
      const data = await fetchLiveActivity(attendance.attendance_id, employee.employee_id);
      setLive(data);
      setQuantity(String(data.actual_quantity ?? 0));
      setPhoto1Url(await createEvidenceUrl(data.photo_1_path));
      setPhoto2Url(await createEvidenceUrl(data.photo_2_path));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load the active activity.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [attendance.attendance_id, employee.employee_id]);

  async function saveQuantity() {
    if (!live) return;
    const numeric = Number(quantity);
    if (!Number.isFinite(numeric) || numeric < 0) {
      Alert.alert('Invalid quantity', 'Enter the actual quantity completed so far.');
      return;
    }

    setSaving(true);
    try {
      await saveLiveActivityProgress(attendance.attendance_id, employee.employee_id, live.project_activity_id, numeric);
      setLive({ ...live, actual_quantity: numeric });
      Alert.alert('Accomplishment updated', `Actual accomplishment is now ${numeric}.`);
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Unable to update accomplishment.');
    } finally {
      setSaving(false);
    }
  }

  async function openCamera(slot: 1 | 2) {
    if (Platform.OS === 'web') {
      Alert.alert('Use the phone', 'Activity photo evidence is captured from the physical phone camera.');
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to upload activity evidence.');
        return;
      }
    }

    setCameraReady(false);
    setCaptureSlot(slot);
  }

  async function capturePhoto() {
    if (!live || !captureSlot || !cameraReady || !cameraRef.current) return;

    setSaving(true);
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.65 });
      if (!result?.uri) throw new Error('The camera did not return a photo.');

      const path = await uploadActivityEvidence(
        result.uri,
        attendance.attendance_id,
        live.project_activity_id,
        captureSlot,
      );

      const currentQuantity = Number(quantity);
      await saveLiveActivityProgress(
        attendance.attendance_id,
        employee.employee_id,
        live.project_activity_id,
        Number.isFinite(currentQuantity) ? currentQuantity : 0,
        captureSlot === 1 ? path : null,
        captureSlot === 2 ? path : null,
      );

      const signed = await createEvidenceUrl(path);
      setLive({
        ...live,
        photo_1_path: captureSlot === 1 ? path : live.photo_1_path,
        photo_2_path: captureSlot === 2 ? path : live.photo_2_path,
      });
      if (captureSlot === 1) setPhoto1Url(signed);
      if (captureSlot === 2) setPhoto2Url(signed);
      setCaptureSlot(null);
      Alert.alert('Photo uploaded', `Activity evidence photo ${captureSlot} was uploaded successfully.`);
    } catch (e) {
      Alert.alert('Photo upload failed', e instanceof Error ? e.message : 'Unable to upload the activity photo.');
    } finally {
      setSaving(false);
    }
  }

  if (captureSlot) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Activity evidence photo {captureSlot}</Text>
        <Text style={styles.muted}>Take a clear photo showing the work completed on site.</Text>
        <View style={styles.evidenceCamera}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
          />
          <View style={styles.cameraCaption}>
            <Text style={styles.cameraCaptionText}>PHOTO {captureSlot} · {cameraReady ? 'READY' : 'STARTING CAMERA...'}</Text>
          </View>
        </View>
        <Button title={saving ? 'UPLOADING...' : 'TAKE PHOTO & UPLOAD'} onPress={capturePhoto} disabled={!cameraReady || saving} />
        <Button title="CANCEL" onPress={() => setCaptureSlot(null)} secondary />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.cardTitle}>ACTIVE ACTIVITY</Text>
        <Text style={styles.liveBadge}>LIVE</Text>
      </View>

      {loading ? <ActivityIndicator /> : null}
      {error ? (
        <View style={styles.error}>
          <Text style={styles.errorTitle}>Unable to load live activity</Text>
          <Text>{error}</Text>
          <Button title="REFRESH" onPress={load} secondary />
        </View>
      ) : null}

      {!loading && !error && live ? (
        <>
          <View style={styles.liveTable}>
            <View style={styles.liveRowHeader}>
              <Text style={styles.liveCellHeader}>ACTIVITY</Text>
              <Text style={styles.liveCellHeader}>PLANNED</Text>
            </View>
            <View style={styles.liveRow}>
              <View style={styles.liveMainCell}>
                <Text style={styles.activityTitle}>{live.activity}</Text>
                {live.activity_item ? <Text style={styles.activityItem}>{live.activity_item}</Text> : null}
                <Text style={styles.project}>{live.project_name}</Text>
              </View>
              <Text style={styles.liveValue}>
                {live.planned_quantity != null ? Number(live.planned_quantity).toLocaleString() : '—'}
              </Text>
            </View>

            <View style={styles.liveRowHeader}>
              <Text style={styles.liveCellHeader}>ACTUAL ACCOMPLISHMENT</Text>
              <Text style={styles.liveCellHeader}>STATUS</Text>
            </View>
            <View style={styles.liveRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  style={styles.quantityInput}
                />
              </View>
              <Text style={styles.liveStatus}>{Number(quantity) > 0 ? 'IN PROGRESS' : 'NOT STARTED'}</Text>
            </View>
          </View>

          <Button title={saving ? 'SAVING...' : 'SAVE ACCOMPLISHMENT'} onPress={saveQuantity} disabled={saving} />

          <View style={styles.evidenceCard}>
            <Text style={styles.label}>PHOTO EVIDENCE</Text>
            <Text style={styles.muted}>Upload up to 2 photos for this activity.</Text>
            <View style={styles.photoRow}>
              <View style={styles.photoBox}>
                {photo1Url ? <Image source={{ uri: photo1Url }} style={styles.photoPreview} /> : <Text style={styles.photoEmpty}>No photo</Text>}
                <Button title={photo1Url ? 'RETAKE PHOTO 1' : 'PHOTO 1'} onPress={() => openCamera(1)} secondary />
              </View>
              <View style={styles.photoBox}>
                {photo2Url ? <Image source={{ uri: photo2Url }} style={styles.photoPreview} /> : <Text style={styles.photoEmpty}>No photo</Text>}
                <Button title={photo2Url ? 'RETAKE PHOTO 2' : 'PHOTO 2'} onPress={() => openCamera(2)} secondary />
              </View>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

function Home({
  employee,
  activeAttendance,
  onApproved,
  onClockIn,
  onClockOut,
}: {
  employee: EmployeeProfile;
  activeAttendance: ActiveAttendance | null;
  onApproved: () => void;
  onClockIn: () => void;
  onClockOut: () => void;
}) {
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
        {activeAttendance ? (
          <>
            <Text style={styles.greenTitle}>Shift is active.</Text>
            <Text style={styles.greenText}>
              {activeAttendance.equipment_name ?? 'Equipment'} · {activeAttendance.project_name ?? 'Project'}
            </Text>
            <Text style={styles.greenText}>
              Time in: {new Date(activeAttendance.time_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
            <Button title="TIME OUT" onPress={onClockOut} secondary />
          </>
        ) : (
          <>
            <Text style={styles.greenTitle}>Ready for a new shift?</Text>
            <Text style={styles.greenText}>Review approved work first. Scan the permanent station QR only when you are ready to clock in.</Text>
            <Button title="VIEW APPROVED ACTIVITIES" onPress={onApproved} />
            <Button title="SCAN & CLOCK IN" onPress={onClockIn} secondary />
          </>
        )}
      </View>

      {activeAttendance ? <LiveActivity employee={employee} attendance={activeAttendance} /> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Employee</Text>
        <Text style={styles.meta}>ID: {employee.employee_id}</Text>
        <Text style={styles.meta}>Department: {employee.department ?? '—'}</Text>
        <Text style={styles.meta}>Status: {employee.status}</Text>
      </View>
    </ScrollView>
  );
}

function ClockIn({
  employee,
  equipment,
  selected,
  setSelected,
  back,
  onClockedIn,
}: {
  employee: EmployeeProfile;
  equipment: Equipment[];
  selected: string;
  setSelected: (id: string) => void;
  back: () => void;
  onClockedIn: (attendanceId: string) => void;
}) {
  const [verified, setVerified] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [items, setItems] = useState<ApprovedActivity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [meterIn, setMeterIn] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [scanError, setScanError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  const selectedEquipment = equipment.find((item) => item.equipment_id === selected);
  const selectedActivity = items.find((item) => item.activity_id === selectedActivityId);

  async function openScanner() {
    setScanError('');

    if (Platform.OS === 'web') {
      setVerified(true);
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setScanError('Camera permission is required to scan the permanent AMANAH station QR.');
        return;
      }
    }

    setScannerOpen(true);
  }

  function validateStationQr(data: string) {
    try {
      const parsed = JSON.parse(data);
      return (
        parsed &&
        parsed.type === STATION.type &&
        parsed.company === STATION.company &&
        parsed.system === STATION.system &&
        (parsed.station === STATION.station || parsed.station === 'AMANAH_STATION_001') &&
        Number(parsed.version) === STATION.version
      );
    } catch {
      return data.trim() === STATION.station || data.trim() === 'AMANAH_STATION_001';
    }
  }

  function handleBarcodeScanned(result: { data: string; type: string }) {
    if (verified) return;

    if (result.type !== 'qr') {
      setScanError('Please scan the AMANAH station QR code.');
      return;
    }

    if (!validateStationQr(result.data)) {
      setScanError('This QR code is not the configured AMANAH station. Please scan the permanent station QR again.');
      return;
    }

    setVerified(true);
    setScannerOpen(false);
    setScanError('');
  }

  async function chooseEquipment(id: string) {
    setSelected(id);
    setSelectedActivityId('');
    setMeterIn('');
    setLoadError('');
    setLoading(true);
    try {
      setItems(await fetchApprovedActivities(id));
    } catch (e) {
      setItems([]);
      setLoadError(e instanceof Error ? e.message : 'Unable to load approved activities.');
    } finally {
      setLoading(false);
    }
  }

  async function saveTimeIn() {
    if (!selectedEquipment) {
      Alert.alert('Equipment required', 'Select the equipment you are using.');
      return;
    }
    if (!selectedActivity) {
      Alert.alert('Approved activity required', 'Select the approved activity you are going to perform.');
      return;
    }

    const numericMeter = Number(meterIn);
    if (!Number.isFinite(numericMeter) || numericMeter < 0) {
      Alert.alert('Meter required', 'Enter the current meter reading.');
      return;
    }

    setLoading(true);
    try {
      const meterType = selectedEquipment.meter_type || 'ODOMETER';
      const meterUnit = meterType.toUpperCase().includes('HOUR') ? 'HRS' : 'KM';

      const { data, error } = await supabase.rpc('record_attendance_time_in', {
        p_employee_id: employee.employee_id,
        p_employee_name: employee.employee_name,
        p_attendance_date: new Date().toISOString().slice(0, 10),
        p_time_in: new Date().toISOString(),
        p_equipment_id: selectedEquipment.equipment_id,
        p_equipment_name: selectedEquipment.equipment_name,
        p_project_id: selectedActivity.project_id,
        p_project_name: selectedActivity.project_name,
        p_meter_type: meterType,
        p_project_activity_id: selectedActivity.activity_id,
        p_meter_in: numericMeter,
        p_meter_unit: meterUnit,
      });

      if (error) throw error;

      const attendanceId =
        typeof data === 'object' && data && 'attendance_id' in data
          ? String((data as Record<string, unknown>).attendance_id)
          : '';

      if (!attendanceId) {
        throw new Error('Attendance was not returned by the Time IN operation.');
      }

      try {
        await saveLiveActivityProgress(
          attendanceId,
          employee.employee_id,
          selectedActivity.activity_id,
          0,
        );
      } catch (progressError) {
        Alert.alert(
          'TIME IN recorded',
          `Attendance was recorded, but the live activity table could not be initialized. You can refresh the app and try again. ${
            progressError instanceof Error ? progressError.message : ''
          }`,
        );
      }

      Alert.alert(
        'TIME IN recorded',
        `${selectedEquipment.equipment_name} is now active for ${selectedActivity.activity} at ${selectedActivity.project_name}.`
      );
      onClockedIn(attendanceId);
    } catch (e) {
      Alert.alert(
        'TIME IN failed',
        e instanceof Error ? e.message : 'Unable to record Time IN.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={back}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      <Text style={styles.eyebrow}>ATTENDANCE IN</Text>
      <Text style={styles.title}>Clock in</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Station QR check</Text>

        {!verified && !scannerOpen ? (
          <>
            <Text style={styles.muted}>
              {Platform.OS === 'web'
                ? 'Web simulation mode. On Android/iPhone the button opens the phone camera.'
                : 'Point the camera at the permanent AMANAH station QR code.'}
            </Text>

            {Platform.OS === 'web' ? (
              <Text style={styles.code}>{JSON.stringify(STATION)}</Text>
            ) : null}

            <Button
              title={Platform.OS === 'web' ? 'SIMULATE STATION SCAN' : 'OPEN CAMERA & SCAN STATION QR'}
              onPress={openScanner}
            />
          </>
        ) : null}

        {scannerOpen ? (
          <View style={styles.scannerFrame}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerBox} />
              <Text style={styles.scannerHint}>Align the permanent AMANAH QR inside the box.</Text>
            </View>
            <Button title="CANCEL SCANNER" onPress={() => setScannerOpen(false)} secondary />
          </View>
        ) : null}

        {scanError ? (
          <View style={styles.error}>
            <Text style={styles.errorTitle}>Station scan</Text>
            <Text>{scanError}</Text>
          </View>
        ) : null}

        {verified ? (
          <Text style={styles.success}>✓ MAIN_ATTENDANCE VERIFIED</Text>
        ) : null}
      </View>

      {verified ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Select equipment</Text>
          <Text style={styles.muted}>
            The approved work below comes from the Activity Calendar assignment for this equipment.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {equipment.map((e) => (
              <Pressable
                key={e.equipment_id}
                onPress={() => chooseEquipment(e.equipment_id)}
                style={[styles.chip, selected === e.equipment_id && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected === e.equipment_id && styles.chipTextSelected]}>
                  {e.equipment_name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {selectedEquipment ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Approved activity</Text>

          {loading ? <View style={styles.center}><ActivityIndicator /></View> : null}

          {loadError ? (
            <View style={styles.error}>
              <Text style={styles.errorTitle}>Unable to load approved activities</Text>
              <Text>{loadError}</Text>
            </View>
          ) : null}

          {!loading && !loadError && items.length === 0 ? (
            <View style={styles.error}>
              <Text style={styles.errorTitle}>No approved activity assigned</Text>
              <Text>
                There is no approved work for {selectedEquipment.equipment_name} in the 7-day schedule.
                Contact the project engineer before starting attendance.
              </Text>
            </View>
          ) : null}

          {!loading && !loadError
            ? items.map((item) => {
                const selectedActivityCard = item.activity_id === selectedActivityId;
                return (
                  <Pressable
                    key={item.activity_id}
                    onPress={() => setSelectedActivityId(item.activity_id)}
                    style={[styles.activity, selectedActivityCard && styles.activitySelected]}
                  >
                    <View style={styles.row}>
                      <Text style={styles.activityDate}>
                        {item.scheduled_start
                          ? new Date(item.scheduled_start).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })
                          : item.activity_date}
                      </Text>
                      <Text style={styles.priority}>{item.priority}</Text>
                    </View>
                    <Text style={styles.activityTitle}>{item.activity}</Text>
                    {item.activity_item ? (
                      <Text style={styles.activityItem}>{item.activity_item}</Text>
                    ) : null}
                    <Text style={styles.project}>{item.project_name}</Text>
                    <Text style={styles.meta}>
                      {item.scheduled_start
                        ? new Date(item.scheduled_start).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : 'Time TBD'}
                      {item.scheduled_end
                        ? ` – ${new Date(item.scheduled_end).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}`
                        : ''}
                    </Text>
                    {item.activity_quantity != null ? (
                      <Text style={styles.meta}>
                        Planned quantity: {Number(item.activity_quantity).toLocaleString()}
                      </Text>
                    ) : null}
                    <Text style={styles.approved}>
                      {selectedActivityCard ? '✓ SELECTED WORK' : 'SELECT THIS APPROVED ACTIVITY'}
                    </Text>
                  </Pressable>
                );
              })
            : null}
        </View>
      ) : null}

      {selectedActivity && selectedEquipment ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Project</Text>
          <Text style={styles.meta}>{selectedActivity.project_name}</Text>
          <Text style={styles.muted}>Project is taken automatically from the approved activity.</Text>

          <Text style={styles.label}>CURRENT {selectedEquipment.meter_type || 'METER'} READING</Text>
          <TextInput
            value={meterIn}
            onChangeText={setMeterIn}
            keyboardType="decimal-pad"
            placeholder={selectedEquipment.meter_type?.toUpperCase().includes('HOUR') ? 'Enter hour meter' : 'Enter odometer'}
            style={styles.input}
          />

          <Text style={styles.muted}>
            Unit: {selectedEquipment.meter_type?.toUpperCase().includes('HOUR') ? 'HRS' : 'KM'}
          </Text>

          <Button
            title={loading ? 'RECORDING...' : 'CONFIRM TIME IN'}
            onPress={saveTimeIn}
            disabled={loading || !meterIn}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function ClockOut({
  employee,
  attendance,
  back,
  onCompleted,
}: {
  employee: EmployeeProfile;
  attendance: ActiveAttendance;
  back: () => void;
  onCompleted: () => void;
}) {
  const [meterOut, setMeterOut] = useState('');
  const [live, setLive] = useState<LiveActivity | null>(null);
  const [fuelUsed, setFuelUsed] = useState(false);
  const [fuelQuantity, setFuelQuantity] = useState('');
  const [fuelAmount, setFuelAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const meterType = attendance.meter_type?.toUpperCase() === 'ODOMETER' ? 'ODOMETER' : 'HOUR METER';
  const meterUnit = meterType === 'ODOMETER' ? 'KM' : 'HRS';

  useEffect(() => {
    let active = true;
    fetchLiveActivity(attendance.attendance_id, employee.employee_id)
      .then(data => {
        if (active) {
          setLive(data);
          setError('');
        }
      })
      .catch(e => {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load the live activity.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attendance.attendance_id, employee.employee_id]);

  async function completeTimeOut() {
    const numericMeter = Number(meterOut);
    const numericFuelQuantity = Number(fuelQuantity);
    const numericFuelAmount = Number(fuelAmount);

    if (!live) {
      Alert.alert('Activity unavailable', 'The live activity could not be loaded.');
      return;
    }

    if (!Number.isFinite(live.actual_quantity) || live.actual_quantity <= 0) {
      Alert.alert('Accomplishment required', 'Enter and save the actual accomplishment in the ACTIVE ACTIVITY table before Time OUT.');
      return;
    }

    if (!Number.isFinite(numericMeter) || numericMeter < 0) {
      Alert.alert('Meter Out required', 'Enter the current meter reading before Time OUT.');
      return;
    }

    if (fuelUsed && (!Number.isFinite(numericFuelQuantity) || numericFuelQuantity <= 0 || !Number.isFinite(numericFuelAmount) || numericFuelAmount < 0)) {
      Alert.alert('Fuel information required', 'Enter the fuel quantity in liters and the total fuel amount.');
      return;
    }

    setLoading(true);
    try {
      const activityDescription = live.activity_item?.trim() || live.description?.trim() || live.activity.trim();

      const { data: prepared, error: prepareError } = await supabase.rpc('prepare_attendance_out', {
        p_attendance_id: attendance.attendance_id,
        p_employee_id: employee.employee_id,
        p_meter_out: numericMeter,
        p_activities: [{
          activity_category: live.activity,
          activity_description: activityDescription,
          quantity: live.actual_quantity,
          photo_1_path: live.photo_1_path,
          photo_2_path: live.photo_2_path,
        }],
      });

      if (prepareError) throw prepareError;
      if (!prepared?.success) throw new Error(prepared?.error || 'Unable to prepare Time OUT.');

      const { data: completed, error: completeError } = await supabase.rpc('complete_attendance', {
        p_attendance_id: attendance.attendance_id,
        p_employee_id: employee.employee_id,
        p_time_out: new Date().toISOString(),
        p_fuel_used: fuelUsed,
        p_fuel_quantity: fuelUsed ? numericFuelQuantity : null,
        p_fuel_unit: fuelUsed ? 'Liter' : null,
        p_fuel_amount: fuelUsed ? numericFuelAmount : null,
      });

      if (completeError) throw completeError;
      if (!completed?.success) throw new Error(completed?.error || 'Unable to complete Time OUT.');

      Alert.alert(
        'TIME OUT recorded',
        `${attendance.equipment_name ?? 'Equipment'} completed ${live.activity} with an actual accomplishment of ${live.actual_quantity}.`,
      );
      onCompleted();
    } catch (e) {
      Alert.alert('TIME OUT failed', e instanceof Error ? e.message : 'Unable to record Time OUT.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={back}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      <Text style={styles.eyebrow}>ATTENDANCE OUT</Text>
      <Text style={styles.title}>Time out</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current shift</Text>
        <Text style={styles.meta}>Equipment: {attendance.equipment_name ?? '—'}</Text>
        <Text style={styles.meta}>Project: {attendance.project_name ?? '—'}</Text>
        <Text style={styles.meta}>Time in: {new Date(attendance.time_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Active activity</Text>
        {loading ? <ActivityIndicator /> : null}
        {error ? <View style={styles.error}><Text style={styles.errorTitle}>Activity unavailable</Text><Text>{error}</Text></View> : null}
        {!loading && !error && live ? (
          <>
            <Text style={styles.activityTitle}>{live.activity}</Text>
            {live.activity_item ? <Text style={styles.activityItem}>{live.activity_item}</Text> : null}
            <Text style={styles.project}>{live.project_name}</Text>
            <Text style={styles.meta}>
              Planned: {live.planned_quantity != null ? Number(live.planned_quantity).toLocaleString() : '—'}
              {' · '}
              Accomplished: {Number(live.actual_quantity).toLocaleString()}
            </Text>
            <Text style={styles.muted}>Activity details and accomplishment are taken from the live activity table.</Text>
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Meter OUT</Text>
        <Text style={styles.label}>CURRENT {meterType} READING</Text>
        <TextInput
          value={meterOut}
          onChangeText={setMeterOut}
          keyboardType="decimal-pad"
          placeholder={meterType === 'ODOMETER' ? 'Enter odometer out' : 'Enter hour meter out'}
          style={styles.input}
        />
        <Text style={styles.muted}>Unit: {meterUnit} · Meter In: {attendance.meter_in ?? '—'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Fuel</Text>
        <Text style={styles.muted}>Was fuel added during this shift?</Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button title="NO" onPress={() => setFuelUsed(false)} secondary={!fuelUsed} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="YES" onPress={() => setFuelUsed(true)} secondary={!fuelUsed} />
          </View>
        </View>

        {fuelUsed ? (
          <>
            <Text style={styles.label}>FUEL QUANTITY (LITERS)</Text>
            <TextInput value={fuelQuantity} onChangeText={setFuelQuantity} keyboardType="decimal-pad" placeholder="Enter liters" style={styles.input} />
            <Text style={styles.label}>FUEL AMOUNT (PHP)</Text>
            <TextInput value={fuelAmount} onChangeText={setFuelAmount} keyboardType="decimal-pad" placeholder="Enter total amount" style={styles.input} />
          </>
        ) : null}
      </View>

      <Button
        title={loading ? 'RECORDING TIME OUT...' : 'CONFIRM TIME OUT'}
        onPress={completeTimeOut}
        disabled={loading || !meterOut || !live}
      />
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
  const [activeAttendance, setActiveAttendance] = useState<ActiveAttendance | null>(null);

  async function hydrate() {
    const { data: { session: s } } = await supabase.auth.getSession();
    setSession(Boolean(s));
    if (s) {
      try {
        setError('');
        const employeeProfile = await fetchMyEmployeeProfile();
        setEmployee(employeeProfile);
        setEquipment(await fetchActiveEquipment());
        setActiveAttendance(await fetchActiveAttendance(employeeProfile.employee_id));
      } catch (e) {
        setEmployee(null);
        setError(e instanceof Error ? e.message : 'Employee profile could not be loaded.');
      }
    } else {
      setEmployee(null);
      setActiveAttendance(null);
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
      {screen === 'home' ? <Home employee={employee} activeAttendance={activeAttendance} onApproved={() => setScreen('approved')} onClockIn={() => setScreen('clockin')} onClockOut={() => setScreen('clockout')} /> : null}
      {screen === 'approved' ? <Approved equipment={equipment} selected={selectedEquipment} setSelected={setSelectedEquipment} /> : null}
      {screen === 'clockin' ? <ClockIn employee={employee} equipment={equipment} selected={selectedEquipment} setSelected={setSelectedEquipment} back={() => setScreen('home')} onClockedIn={async () => { setActiveAttendance(await fetchActiveAttendance(employee.employee_id)); setScreen('home'); }} /> : null}
      {screen === 'clockout' && activeAttendance ? <ClockOut employee={employee} attendance={activeAttendance} back={() => setScreen('home')} onCompleted={async () => { setActiveAttendance(await fetchActiveAttendance(employee.employee_id)); setScreen('home'); }} /> : null}
      {screen === 'profile' ? <Profile employee={employee} signOut={() => supabase.auth.signOut()} /> : null}

      {screen !== 'clockin' && screen !== 'clockout' ? (
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
  activitySelected: { borderColor: '#145A3B', backgroundColor: '#F0F7F3' },
  activityForm: { backgroundColor: '#F8FBF9', borderRadius: 14, padding: 14, gap: 9, borderWidth: 1, borderColor: '#E0E9E3' },
  activitySelectedCard: { backgroundColor: '#F0F7F3', borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: '#145A3B' },
  scannerFrame: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#101713', gap: 10 },
  camera: { width: '100%', height: 420 },
  scannerOverlay: { position: 'absolute', left: 0, right: 0, top: 0, height: 420, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scannerBox: { width: 230, height: 230, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 18, backgroundColor: 'transparent' },
  scannerHint: { marginTop: 18, color: '#FFFFFF', textAlign: 'center', fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
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
  liveBadge: { color: '#145A3B', backgroundColor: '#E5F2EA', fontSize: 10, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, overflow: 'hidden' },
  liveTable: { borderWidth: 1, borderColor: '#D9E6DE', borderRadius: 14, overflow: 'hidden', backgroundColor: '#FBFDFC' },
  liveRowHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#EEF6F1' },
  liveCellHeader: { color: '#527064', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderTopWidth: 1, borderTopColor: '#E1EAE4' },
  liveMainCell: { flex: 1, gap: 3, paddingRight: 10 },
  liveValue: { color: '#145A3B', fontSize: 16, fontWeight: '900', minWidth: 60, textAlign: 'right' },
  liveStatus: { color: '#A06016', fontSize: 10, fontWeight: '900', minWidth: 85, textAlign: 'right' },
  quantityInput: { borderWidth: 1, borderColor: '#BFD1C6', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: '#FFF', fontSize: 18, fontWeight: '800' },
  evidenceCard: { gap: 10, marginTop: 4 },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoBox: { flex: 1, gap: 7 },
  photoPreview: { width: '100%', height: 120, borderRadius: 12, backgroundColor: '#EAF1EC' },
  photoEmpty: { width: '100%', height: 120, borderRadius: 12, backgroundColor: '#F0F4F1', color: '#7A8780', textAlign: 'center', textAlignVertical: 'center', paddingTop: 48 },
  evidenceCamera: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#111', position: 'relative' },
  cameraCaption: { position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center' },
  cameraCaptionText: { color: '#FFF', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, fontWeight: '800', fontSize: 11 },
});
