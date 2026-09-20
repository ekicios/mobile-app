import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import WebRTCService from '../WebRTCService';

export default function ConnectionScreen() {
  const [ip, setIp] = useState('192.168.1.16');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleConnect = () => {
    if (!ip || !code || code.length !== 6) {
      setStatus('Please enter IP and 6-digit code');
      return;
    }

    setLoading(true);
    setStatus('Connecting...');

    WebRTCService.connect(ip, code, (newStatus) => {
      setStatus(newStatus);
      console.log("webrtservice status:::", newStatus)
      if (newStatus === 'CONNECTED') {
        setLoading(false);
        router.push('/remote');
      } else if (newStatus === 'WS_ERROR' || newStatus === 'failed' || newStatus === 'disconnected') {
        setLoading(false);
        setStatus('Connection failed. Please try again.');
        WebRTCService.disconnect();
      }
    }, (msg) => {
      console.log('Message from TV:', msg);
    });
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Connect to TV</Text>

        <Text style={styles.label}>Signaling Server IP</Text>
        <TextInput
          style={styles.input}
          value={ip}
          onChangeText={setIp}
          placeholder="192.168.1.x"
          placeholderTextColor="#888"
        />

        <Text style={styles.label}>6-Digit Pairing Code</Text>
        <TextInput
          style={[styles.input, styles.codeInput]}
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor="#888"
          keyboardType="number-pad"
          maxLength={6}
        />

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Connect</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.status}>{status}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#121212',
  },
  card: {
    backgroundColor: '#1e1e1e',
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#bb86fc',
    marginBottom: 24,
    textAlign: 'center',
  },
  label: {
    color: '#aaaaaa',
    marginBottom: 8,
    fontSize: 14,
  },
  input: {
    backgroundColor: '#2d2d2d',
    color: '#ffffff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  codeInput: {
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
  },
  button: {
    backgroundColor: '#bb86fc',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#664d8a',
  },
  buttonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 16,
  },
  status: {
    marginTop: 20,
    color: '#03dac6',
    textAlign: 'center',
    fontSize: 14,
  }
});
