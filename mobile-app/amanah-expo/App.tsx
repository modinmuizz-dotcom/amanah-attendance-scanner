import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { File as ExpoFile } from 'expo-file-system';

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
  const dateLabel = item.is_carryover && item.carryover_from_date
    ? `CARRYOVER · ${new Date(item.carryover_from_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : start
      ? start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      : item.activity_date;

  const isDone = item.activity_status === 'DONE';

  return (
    <View style={[styles.activity, isDone && { opacity: 0.65 }]}>
      <View style={styles.row}>
        <Text style={styles.activityDate}>{dateLabel}</Text>
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

      {item.activity_quantity != null ? (
        <Text style={styles.meta}>
          Planned quantity: {Number(item.activity_quantity).toLocaleString()}
        </Text>
      ) : null}

      {item.actual_quantity > 0 ? (
        <Text style={styles.meta}>
          Actual: {Number(item.actual_quantity).toLocaleString()} · Remaining: {Number(item.remaining_quantity).toLocaleString()}
        </Text>
      ) : null}

      {item.is_carryover ? (
        <Text style={styles.approved}>
          {isDone ? '✓ DONE — COMPLETED' : item.selection_available ? '↻ CARRYOVER — CONTINUE REMAINING WORK' : 'CARRYOVER — SLOT ALREADY CLAIMED'}
        </Text>
      ) : (
        <Text style={styles.approved}>
          {isDone ? '✓ DONE — COMPLETED' : 'APPROVED FOR THIS EQUIPMENT'}
        </Text>
      )}
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
      <Text style={styles.title}>Upcoming & Carryover Work</Text>
      <Text style={styles.muted}>Approved work plus unfinished carryover work from the previous 7 days. Filter by equipment to see what that equipment can continue.</Text>

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
      {!loading && !error && items.length === 0 ? <View style={styles.card}><Text style={styles.cardTitle}>No approved or carryover activities</Text><Text style={styles.muted}>There is no approved work or unfinished carryover work available for this equipment.</Text></View> : null}
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

async function readLocalPhoto(uri: string): Promise<ArrayBuffer> {
  try {
    const file = new ExpoFile(uri);
    if (!file.exists) {
      throw new Error('The selected photo is no longer available on the device.');
    }
    return await file.arrayBuffer();
  } catch (fileError) {
    // Some Android media providers expose content:// URIs. Expo File handles
    // these, but keep a network fetch fallback for normal file:// URIs.
    try {
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Unable to read the selected photo (${response.status}).`);
      }
      return await response.arrayBuffer();
    } catch (fetchError) {
      throw new Error(
        fetchError instanceof Error
          ? fetchError.message
          : 'Unable to read the selected photo from the phone.',
      );
    }
  }
}

async function uploadActivityEvidence(uri: string, attendanceId: string, activityId: string, slot: 1 | 2) {
  const arrayBuffer = await readLocalPhoto(uri);
  const path = `attendance/${attendanceId}/${activityId}/activity_${slot}_${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('attendance-activity-evidence')
    .upload(path, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
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



type AdditionalEvidence = {
  evidence_id: string;
  photo_path: string;
  signed_url: string | null;
  local_uri?: string | null;
  created_at: string;
};

async function fetchAdditionalActivityEvidence(attendanceId: string, activityId: string): Promise<AdditionalEvidence[]> {
  const { data, error } = await supabase
    .from('activity_evidence_photos')
    .select('evidence_id, photo_path, created_at')
    .eq('attendance_id', attendanceId)
    .eq('project_activity_id', activityId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return await Promise.all(
    (data ?? []).map(async (row: any) => ({
      evidence_id: row.evidence_id,
      photo_path: row.photo_path,
      signed_url: await createEvidenceUrl(row.photo_path),
      local_uri: null,
      created_at: row.created_at,
    })),
  );
}

async function uploadAdditionalActivityEvidence(
  uri: string,
  attendanceId: string,
  activityId: string,
  employeeId: string,
): Promise<AdditionalEvidence> {
  const arrayBuffer = await readLocalPhoto(uri);
  const path = `attendance/${attendanceId}/${activityId}/activity_extra_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('attendance-activity-evidence')
    .upload(path, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('activity_evidence_photos')
    .insert({
      attendance_id: attendanceId,
      project_activity_id: activityId,
      employee_id: employeeId,
      photo_path: path,
    })
    .select('evidence_id, photo_path, created_at')
    .single();

  if (error) throw error;

  return {
    evidence_id: data.evidence_id,
    photo_path: data.photo_path,
    signed_url: await createEvidenceUrl(data.photo_path),
    local_uri: uri,
    created_at: data.created_at,
  };
}


async function replaceAdditionalActivityEvidence(
  evidenceId: string,
  oldPath: string,
  uri: string,
  attendanceId: string,
  activityId: string,
): Promise<AdditionalEvidence> {
  const arrayBuffer = await readLocalPhoto(uri);
  const newPath = `attendance/${attendanceId}/${activityId}/activity_extra_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('attendance-activity-evidence')
    .upload(newPath, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('activity_evidence_photos')
    .update({ photo_path: newPath, created_at: new Date().toISOString() })
    .eq('evidence_id', evidenceId)
    .eq('attendance_id', attendanceId)
    .eq('project_activity_id', activityId)
    .select('evidence_id, photo_path, created_at')
    .single();

  if (error) throw error;

  // The old object is no longer referenced by the activity record. We keep
  // it in storage for now so a failed replacement can never destroy evidence.
  void oldPath;

  return {
    evidence_id: data.evidence_id,
    photo_path: data.photo_path,
    signed_url: await createEvidenceUrl(data.photo_path),
    created_at: data.created_at,
  };
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
  const [photo1LocalUri, setPhoto1LocalUri] = useState<string | null>(null);
  const [photo2LocalUri, setPhoto2LocalUri] = useState<string | null>(null);
  const [photo1PreviewError, setPhoto1PreviewError] = useState(false);
  const [photo2PreviewError, setPhoto2PreviewError] = useState(false);
  const [extraEvidence, setExtraEvidence] = useState<AdditionalEvidence[]>([]);
  const [extraCaptureOpen, setExtraCaptureOpen] = useState(false);
  const [extraReplaceTarget, setExtraReplaceTarget] = useState<AdditionalEvidence | null>(null);
  const [extraCameraReady, setExtraCameraReady] = useState(false);
  const [savedQuantity, setSavedQuantity] = useState<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();

  async function load() {
    setLoading(true);
    try {
      const data = await fetchLiveActivity(attendance.attendance_id, employee.employee_id);
      setLive(data);
      setQuantity(String(data.actual_quantity ?? 0));
      setSavedQuantity(Number(data.actual_quantity ?? 0));
      setLastSavedAt(null);
      setPhoto1PreviewError(false);
      setPhoto2PreviewError(false);
      setPhoto1Url(await createEvidenceUrl(data.photo_1_path));
      setPhoto2Url(await createEvidenceUrl(data.photo_2_path));
      setExtraEvidence(await fetchAdditionalActivityEvidence(attendance.attendance_id, data.project_activity_id));
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
      setSavedQuantity(numeric);
      setLastSavedAt(new Date().toISOString());
      Alert.alert('Accomplishment saved', `Actual accomplishment is now ${numeric} and has been saved to Supabase.`);
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Unable to update accomplishment.');
    } finally {
      setSaving(false);
    }
  }

  async function chooseFromPhone(slot: 1 | 2) {
    if (!live) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.75,
      });

      if (result.canceled || !result.assets?.length) return;

      setSaving(true);
      const path = await uploadActivityEvidence(
        result.assets[0].uri,
        attendance.attendance_id,
        live.project_activity_id,
        slot,
      );

      const currentQuantity = Number(quantity);
      await saveLiveActivityProgress(
        attendance.attendance_id,
        employee.employee_id,
        live.project_activity_id,
        Number.isFinite(currentQuantity) ? currentQuantity : 0,
        slot === 1 ? path : null,
        slot === 2 ? path : null,
      );

      const signed = await createEvidenceUrl(path);
      setLive({
        ...live,
        photo_1_path: slot === 1 ? path : live.photo_1_path,
        photo_2_path: slot === 2 ? path : live.photo_2_path,
      });
      if (slot === 1) {
        setPhoto1LocalUri(result.assets[0].uri);
        setPhoto1Url(signed);
        setPhoto1PreviewError(false);
      }
      if (slot === 2) {
        setPhoto2LocalUri(result.assets[0].uri);
        setPhoto2Url(signed);
        setPhoto2PreviewError(false);
      }
      Alert.alert('Photo uploaded', `Activity evidence photo ${slot} was uploaded successfully and linked to the live activity.`);
    } catch (e) {
      Alert.alert('Photo upload failed', e instanceof Error ? e.message : 'Unable to upload the selected photo.');
    } finally {
      setSaving(false);
    }
  }

  async function replaceExtraPhoto(photo: AdditionalEvidence) {
    if (!live) return;

    Alert.alert(
      'REPLACE PHOTO',
      'Choose how you want to replace this activity evidence photo.',
      [
        { text: 'TAKE NEW PHOTO', onPress: () => {
          setExtraReplaceTarget(photo);
          openExtraCamera();
        }},
        { text: 'CHOOSE FROM PHONE', onPress: async () => {
          try {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.75,
            });

            if (result.canceled || !result.assets?.length) return;

            setSaving(true);
            const replacement = await replaceAdditionalActivityEvidence(
              photo.evidence_id,
              photo.photo_path,
              result.assets[0].uri,
              attendance.attendance_id,
              live.project_activity_id,
            );

            setExtraEvidence(previous =>
              previous.map(item => item.evidence_id === photo.evidence_id ? replacement : item),
            );

            Alert.alert('Photo replaced', 'The activity evidence photo has been replaced successfully.');
          } catch (e) {
            Alert.alert('Photo replacement failed', e instanceof Error ? e.message : 'Unable to replace the photo.');
          } finally {
            setSaving(false);
          }
        }},
        { text: 'CANCEL', style: 'cancel' },
      ],
    );
  }

  async function addMorePhotoEvidence() {
    if (!live) return;
    if (Platform.OS === 'web') {
      Alert.alert('Use the phone', 'Additional activity evidence is captured from the physical phone.');
      return;
    }

    Alert.alert(
      'ADD PHOTO EVIDENCE',
      'Choose how you want to add another work evidence photo.',
      [
        { text: 'TAKE PHOTO', onPress: () => openExtraCamera() },
        { text: 'CHOOSE FROM PHONE', onPress: () => chooseAdditionalPhoto() },
        { text: 'CANCEL', style: 'cancel' },
      ],
    );
  }

  async function chooseAdditionalPhoto() {
    if (!live) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.75,
      });

      if (result.canceled || !result.assets?.length) return;

      setSaving(true);
      const evidence = await uploadAdditionalActivityEvidence(
        result.assets[0].uri,
        attendance.attendance_id,
        live.project_activity_id,
        employee.employee_id,
      );
      setExtraEvidence(previous => [...previous, evidence]);
      Alert.alert('Photo uploaded', 'Additional activity evidence was saved to Supabase.');
    } catch (e) {
      Alert.alert('Photo upload failed', e instanceof Error ? e.message : 'Unable to upload the additional photo.');
    } finally {
      setSaving(false);
    }
  }

  async function openExtraCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to add additional activity evidence.');
        return;
      }
    }
    setExtraCameraReady(false);
    setExtraCaptureOpen(true);
  }

  async function captureExtraPhoto() {
    if (!live || !extraCaptureOpen || !extraCameraReady || !cameraRef.current) return;

    setSaving(true);
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.65 });
      if (!result?.uri) throw new Error('The camera did not return a photo.');

      if (extraReplaceTarget) {
        const replacement = await replaceAdditionalActivityEvidence(
          extraReplaceTarget.evidence_id,
          extraReplaceTarget.photo_path,
          result.uri,
          attendance.attendance_id,
          live.project_activity_id,
        );
        setExtraEvidence(previous =>
          previous.map(item => item.evidence_id === extraReplaceTarget.evidence_id ? replacement : item),
        );
        setExtraReplaceTarget(null);
        setExtraCaptureOpen(false);
        Alert.alert('Photo replaced', 'The activity evidence photo has been replaced successfully.');
      } else {
        const evidence = await uploadAdditionalActivityEvidence(
          result.uri,
          attendance.attendance_id,
          live.project_activity_id,
          employee.employee_id,
        );
        setExtraEvidence(previous => [...previous, evidence]);
        setExtraCaptureOpen(false);
        Alert.alert('Photo uploaded', 'Additional activity evidence was saved to Supabase.');
      }
    } catch (e) {
      Alert.alert('Photo upload failed', e instanceof Error ? e.message : 'Unable to upload the additional photo.');
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
      if (captureSlot === 1) {
        setPhoto1LocalUri(result.uri);
        setPhoto1Url(signed);
        setPhoto1PreviewError(false);
      }
      if (captureSlot === 2) {
        setPhoto2LocalUri(result.uri);
        setPhoto2Url(signed);
        setPhoto2PreviewError(false);
      }
      setCaptureSlot(null);
      Alert.alert('Photo uploaded', `Activity evidence photo ${captureSlot} was uploaded successfully and linked to the live activity.`);
    } catch (e) {
      Alert.alert('Photo upload failed', e instanceof Error ? e.message : 'Unable to upload the activity photo.');
    } finally {
      setSaving(false);
    }
  }

  if (extraCaptureOpen) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Additional activity evidence</Text>
        <Text style={styles.muted}>Take another clear photo showing the work completed on site.</Text>
        <View style={styles.evidenceCamera}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            onCameraReady={() => setExtraCameraReady(true)}
          />
          <View style={styles.cameraCaption}>
            <Text style={styles.cameraCaptionText}>ADDITIONAL PHOTO · {extraCameraReady ? 'READY' : 'STARTING CAMERA...'}</Text>
          </View>
        </View>
        <Button title={saving ? 'UPLOADING...' : 'TAKE PHOTO & UPLOAD'} onPress={captureExtraPhoto} disabled={!extraCameraReady || saving} />
        <Button title="CANCEL" onPress={() => { setExtraReplaceTarget(null); setExtraCaptureOpen(false); }} secondary />
      </View>
    );
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
          <View style={styles.saveStatusCard}>
            <Text style={styles.saveStatusTitle}>{savedQuantity !== null ? `✓ SAVED TO SUPABASE: ${savedQuantity}` : 'NOT YET SAVED'}</Text>
            <Text style={styles.saveStatusText}>
              {lastSavedAt
                ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : 'Change the quantity and tap SAVE ACCOMPLISHMENT.'}
            </Text>
          </View>

          <View style={styles.evidenceCard}>
            <Text style={styles.label}>PHOTO EVIDENCE</Text>
            <Text style={styles.muted}>Upload up to 2 photos for this activity.</Text>
            <View style={styles.photoRow}>
              <View style={styles.photoBox}>
                {(photo1LocalUri || photo1Url) && !photo1PreviewError ? (
                  <Image
                    source={{ uri: photo1LocalUri || photo1Url || undefined }}
                    style={styles.photoPreview}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                    onError={() => setPhoto1PreviewError(true)}
                  />
                ) : (
                  <View style={styles.photoEmptyBox}>
                    <Text style={styles.photoEmpty}>{photo1Url || photo1LocalUri ? 'PHOTO UPLOADED' : 'No photo'}</Text>
                  </View>
                )}
                <Text style={styles.savedEvidence}>{photo1Url || photo1LocalUri ? '✓ EVIDENCE SAVED' : 'WAITING FOR PHOTO'}</Text>
                <Button title={photo1Url || photo1LocalUri ? 'RETAKE PHOTO 1' : 'TAKE PHOTO 1'} onPress={() => openCamera(1)} secondary />
                <Button title="CHOOSE PHOTO 1" onPress={() => chooseFromPhone(1)} secondary disabled={saving} />
              </View>
              <View style={styles.photoBox}>
                {(photo2LocalUri || photo2Url) && !photo2PreviewError ? (
                  <Image
                    source={{ uri: photo2LocalUri || photo2Url || undefined }}
                    style={styles.photoPreview}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                    onError={() => setPhoto2PreviewError(true)}
                  />
                ) : (
                  <View style={styles.photoEmptyBox}>
                    <Text style={styles.photoEmpty}>{photo2Url || photo2LocalUri ? 'PHOTO UPLOADED' : 'No photo'}</Text>
                  </View>
                )}
                <Text style={styles.savedEvidence}>{photo2Url || photo2LocalUri ? '✓ EVIDENCE SAVED' : 'WAITING FOR PHOTO'}</Text>
                <Button title={photo2Url || photo2LocalUri ? 'RETAKE PHOTO 2' : 'TAKE PHOTO 2'} onPress={() => openCamera(2)} secondary />
                <Button title="CHOOSE PHOTO 2" onPress={() => chooseFromPhone(2)} secondary disabled={saving} />
              </View>
            </View>
          <View style={styles.extraEvidenceSection}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>ADDITIONAL PHOTO EVIDENCE</Text>
                <Text style={styles.muted}>No limit. Add more photos as the work progresses.</Text>
              </View>
              <Text style={styles.extraCount}>{extraEvidence.length} ADDED</Text>
            </View>

            {extraEvidence.length ? (
              <View style={styles.extraPhotoGrid}>
                {extraEvidence.map((photo, index) => (
                  <View key={photo.evidence_id} style={styles.extraPhotoBox}>
                    {photo.signed_url ? (
                      <Image source={{ uri: photo.local_uri || photo.signed_url || undefined }} style={styles.extraPhotoPreview} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                    ) : (
                      <View style={styles.photoEmptyBox}><Text style={styles.photoEmpty}>PHOTO SAVED</Text></View>
                    )}
                    <Text style={styles.savedEvidence}>✓ EVIDENCE SAVED</Text>
                    <Text style={styles.extraPhotoLabel}>PHOTO {index + 3}</Text>
                    <Button
                      title="REPLACE PHOTO"
                      onPress={() => replaceExtraPhoto(photo)}
                      secondary
                      disabled={saving}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            <Button
              title={saving ? 'UPLOADING...' : '＋ ADD MORE PHOTO EVIDENCE'}
              onPress={addMorePhotoEvidence}
              secondary
              disabled={saving}
            />
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
        p_attendance_date: new Date().toLocaleDateString('en-CA'),
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
                const isDone = item.activity_status === 'DONE';
                const disabled = !item.selection_available || isDone;

                return (
                  <Pressable
                    key={item.activity_id}
                    onPress={() => {
                      if (disabled) {
                        Alert.alert(
                          'Activity not available',
                          item.selection_reason || (isDone ? 'This activity is already DONE and cannot be selected again.' : 'This activity is not available for this equipment.'),
                        );
                        return;
                      }
                      setSelectedActivityId(item.activity_id);
                    }}
                    style={[
                      styles.activity,
                      selectedActivityCard && styles.activitySelected,
                      disabled && { opacity: 0.58 },
                    ]}
                  >
                    <View style={styles.row}>
                      <Text style={styles.activityDate}>
                        {item.is_carryover && item.carryover_from_date
                          ? `CARRYOVER · ${new Date(item.carryover_from_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                          : item.scheduled_start
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

                    <Text style={styles.meta}>
                      Actual: {Number(item.actual_quantity || 0).toLocaleString()}
                      {' · '}
                      Remaining: {Number(item.remaining_quantity || 0).toLocaleString()}
                    </Text>

                    {item.is_carryover ? (
                      <Text style={styles.approved}>
                        {isDone ? '✓ DONE — COMPLETED' : item.selection_available ? '↻ CONTINUE CARRYOVER' : item.selection_reason || 'CARRYOVER NOT AVAILABLE'}
                      </Text>
                    ) : (
                      <Text style={styles.approved}>
                        {isDone ? '✓ DONE — COMPLETED' : selectedActivityCard ? '✓ SELECTED WORK' : 'SELECT THIS APPROVED ACTIVITY'}
                      </Text>
                    )}
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
  const [fuelPhotoLocalUri, setFuelPhotoLocalUri] = useState<string | null>(null);
  const [fuelPhotoPreviewError, setFuelPhotoPreviewError] = useState(false);
  const [fuelCameraOpen, setFuelCameraOpen] = useState(false);
  const [fuelCameraReady, setFuelCameraReady] = useState(false);
  const fuelCameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
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

  async function chooseFuelPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.75,
      });
      if (result.canceled || !result.assets?.length) return;
      setFuelPhotoLocalUri(result.assets[0].uri);
      setFuelPhotoPreviewError(false);
    } catch (e) {
      Alert.alert('Fuel photo failed', e instanceof Error ? e.message : 'Unable to choose the fuel photo.');
    }
  }

  async function takeFuelPhoto() {
    if (Platform.OS === 'web') {
      Alert.alert('Use the phone', 'Fuel evidence is captured from the physical phone camera.');
      return;
    }
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to capture fuel evidence.');
        return;
      }
    }
    setFuelCameraReady(false);
    setFuelCameraOpen(true);
  }

  async function captureFuelPhoto() {
    if (!fuelCameraOpen || !fuelCameraReady || !fuelCameraRef.current) return;
    try {
      const result = await fuelCameraRef.current.takePictureAsync({ quality: 0.65 });
      if (!result?.uri) throw new Error('The camera did not return a photo.');
      setFuelPhotoLocalUri(result.uri);
      setFuelPhotoPreviewError(false);
      setFuelCameraOpen(false);
    } catch (e) {
      Alert.alert('Fuel photo failed', e instanceof Error ? e.message : 'Unable to capture the fuel photo.');
    }
  }

  async function uploadFuelEvidence(uri: string) {
    const arrayBuffer = await readLocalPhoto(uri);
    const path = 'attendance/' + attendance.attendance_id + '/fuel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg';
    const { error: uploadError } = await supabase.storage
      .from('attendance-fuel-evidence')
      .upload(path, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
        cacheControl: '3600',
      });
    if (uploadError) throw uploadError;
    return path;
  }
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

    if (fuelUsed && !fuelPhotoLocalUri) {
      Alert.alert('Fuel photo required', 'Because fuel was added during this shift, upload or capture a fuel evidence photo before Time OUT.');
      return;
    }

    setLoading(true);
    try {
      const activityDescription = live.activity_item?.trim() || live.description?.trim() || live.activity.trim();
      const fuelPhotoPath = fuelUsed && fuelPhotoLocalUri
        ? await uploadFuelEvidence(fuelPhotoLocalUri)
        : null;

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

      if (fuelPhotoPath) {
        const { data: attached, error: attachError } = await supabase.rpc('attach_fuel_evidence', {
          p_attendance_id: attendance.attendance_id,
          p_employee_id: employee.employee_id,
          p_photo_path: fuelPhotoPath,
        });

        if (attachError) throw attachError;
        if (!attached?.success) throw new Error(attached?.error || 'Fuel was recorded but the fuel evidence photo could not be linked.');
      }

      Alert.alert(
        'TIME OUT recorded',
        `${attendance.equipment_name ?? 'Equipment'} completed ${live.activity} with an actual accomplishment of ${live.actual_quantity}${fuelPhotoPath ? ' and fuel evidence was saved.' : '.'}`,
      );
      onCompleted();
    } catch (e) {
      Alert.alert('TIME OUT failed', e instanceof Error ? e.message : 'Unable to record Time OUT.');
    } finally {
      setLoading(false);
    }
  }

  if (fuelCameraOpen) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fuel evidence photo</Text>
          <Text style={styles.muted}>Take a clear photo of the fuel receipt, pump reading, or other proof of the fuel added.</Text>
          <View style={styles.evidenceCamera}>
            <CameraView
              ref={fuelCameraRef}
              style={styles.camera}
              facing="back"
              onCameraReady={() => setFuelCameraReady(true)}
            />
            <View style={styles.cameraCaption}>
              <Text style={styles.cameraCaptionText}>FUEL PHOTO · {fuelCameraReady ? 'READY' : 'STARTING CAMERA...'}</Text>
            </View>
          </View>
          <Button title={fuelCameraReady ? 'TAKE PHOTO' : 'STARTING CAMERA...'} onPress={captureFuelPhoto} disabled={!fuelCameraReady} />
          <Button title="CANCEL" onPress={() => setFuelCameraOpen(false)} secondary />
        </View>
      </ScrollView>
    );
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
            <Button title="NO" onPress={() => setFuelUsed(false)} secondary={fuelUsed} />
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

            <Text style={styles.label}>FUEL PHOTO EVIDENCE</Text>
            <Text style={styles.muted}>Required when fuel is YES. Capture the receipt, pump reading, or other proof of fueling.</Text>

            {fuelPhotoLocalUri && !fuelPhotoPreviewError ? (
              <Image
                source={{ uri: fuelPhotoLocalUri }}
                style={styles.photoPreview}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
                onError={() => setFuelPhotoPreviewError(true)}
              />
            ) : (
              <View style={styles.photoEmptyBox}>
                <Text style={styles.photoEmpty}>{fuelPhotoLocalUri ? 'PHOTO SELECTED' : 'NO FUEL PHOTO YET'}</Text>
              </View>
            )}

            <Text style={styles.savedEvidence}>{fuelPhotoLocalUri ? '✓ FUEL EVIDENCE READY' : 'FUEL EVIDENCE REQUIRED'}</Text>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button
                  title={fuelPhotoLocalUri ? 'REPLACE FUEL PHOTO' : 'TAKE FUEL PHOTO'}
                  onPress={takeFuelPhoto}
                  secondary
                  disabled={loading}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="CHOOSE FROM PHONE"
                  onPress={chooseFuelPhoto}
                  secondary
                  disabled={loading}
                />
              </View>
            </View>
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
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
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
  extraEvidenceSection: { gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E1EAE4' },
  extraCount: { color: '#145A3B', fontSize: 10, fontWeight: '900' },
  extraPhotoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  extraPhotoBox: { width: '47%', gap: 5 },
  extraPhotoPreview: { width: '100%', height: 110, borderRadius: 12, backgroundColor: '#EAF1EC' },
  extraPhotoLabel: { color: '#527064', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  evidenceCard: { gap: 10, marginTop: 4 },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoBox: { flex: 1, gap: 7 },
  photoPreview: { width: '100%', height: 120, borderRadius: 12, backgroundColor: '#EAF1EC' },
  photoEmptyBox: { width: '100%', height: 120, borderRadius: 12, backgroundColor: '#F0F4F1', alignItems: 'center', justifyContent: 'center' },
  photoEmpty: { color: '#7A8780', textAlign: 'center', fontWeight: '800', fontSize: 12 },
  savedEvidence: { color: '#145A3B', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  saveStatusCard: { borderWidth: 1, borderColor: '#BFD8C9', borderRadius: 12, backgroundColor: '#EEF7F1', padding: 12, gap: 4 },
  saveStatusTitle: { color: '#145A3B', fontWeight: '900', fontSize: 13 },
  saveStatusText: { color: '#61756B', fontSize: 12 },
  evidenceCamera: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#111', position: 'relative' },
  cameraCaption: { position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center' },
  cameraCaptionText: { color: '#FFF', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, fontWeight: '800', fontSize: 11 },
});