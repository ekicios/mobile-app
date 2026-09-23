import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import WebOSTV from '../WebOSTVService';
import { sendToTV } from '../sendToTV';

const WEB_APP_ID = 'com.myapp.hosted'; // must match tv-test/appinfo.json `id`

export default function ConnectionScreen() {
  const [ip, setIp] = useState('192.168.1.29');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const router = useRouter();

  // LG webOS TVs are not discovered via Samsung SSDP; guide the user to the IP.
  const handleFind = async () => {
    setScanning(true);
    setStatus('Searching…');
    setTimeout(() => {
      setScanning(false);
      setStatus(
        'Enter your LG webOS TV IP (Settings → Network → Wired/Wi‑Fi Connection → see IP address).'
      );
    }, 600);
  };

  const handleConnect = () => {
    if (!ip) {
      setStatus('Please enter the TV IP address');
      return;
    }

    setLoading(true);
    setStatus('Connecting…');

    WebOSTV.connect(ip, (newStatus) => {
      setStatus(newStatus);

      if (newStatus === 'CONNECTED') {
        // SSAP handshake done. Now launch the hosted app and connect to its
        // app channel (this is what makes p2p JSON delivery possible).
        setStatus('Launching app…');
        sendToTV({ type: '__PING__' })
          .then(() => {
            setLoading(false);
            router.push('/remote');
          })
          .catch((e) => {
            setLoading(false);
            setStatus('Connected, but app-channel failed: ' + (e && e.message));
            console.log('[index] app channel error:', e && e.message);
          });
      } else if (newStatus === 'PAIRING') {
        // TV shows an on-screen Allow prompt; wait for the user to accept.
        setStatus('Waiting for TV confirmation — press “Allow” on the TV.');
      } else if (newStatus === 'UNAUTHORIZED') {
        setLoading(false);
        setStatus('TV denied access. Remove old entries on the TV, then retry.');
      } else if (newStatus === 'ERROR' || newStatus === 'DISCONNECTED') {
        setLoading(false);
        setStatus('Connection failed. Check the IP and that the TV is on.');
        WebOSTV.disconnect();
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

        <TouchableOpacity
          style={[styles.findBtn, scanning && styles.buttonDisabled]}
          onPress={handleFind}
          disabled={scanning}
        >
          <Text style={styles.findText}>{scanning ? 'Searching…' : 'Find TVs'}</Text>
        </TouchableOpacity>

        <Text style={styles.label}>TV IP Address</Text>
        <TextInput
          style={styles.input}
          value={ip}
          onChangeText={setIp}
          placeholder="192.168.1.x"
          placeholderTextColor="#888"
        />

        <Text style={styles.hint}>Accept the “Allow” prompt on your TV after connecting.</Text>

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
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  hint: {
    color: '#888888',
    fontSize: 12,
    marginBottom: 20,
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
  findBtn: {
    backgroundColor: '#03dac6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  findText: {
    color: '#121212',
    fontWeight: 'bold',
  },
  tvItem: {
    backgroundColor: '#2d2d2d',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#03dac6',
  },
  tvText: {
    color: '#03dac6',
    fontSize: 16,
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



