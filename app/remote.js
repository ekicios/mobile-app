import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import TVService from '../TVService';

export default function RemoteScreen() {
  const router = useRouter();
  const [customText, setCustomText] = useState('');

  const send = (action, payload = null) => {
    TVService.sendCommand({ action, payload, timestamp: Date.now() });
  };

  const handleDisconnect = () => {
    TVService.disconnect();
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.status}>Connected</Text>
        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dpadContainer}>
        <TouchableOpacity style={styles.dpadBtn} onPress={() => send('UP')}>
          <Text style={styles.dpadText}>UP</Text>
        </TouchableOpacity>
        <View style={styles.dpadRow}>
          <TouchableOpacity style={styles.dpadBtn} onPress={() => send('LEFT')}>
            <Text style={styles.dpadText}>LEFT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dpadBtn, styles.okBtn]} onPress={() => send('OK')}>
            <Text style={styles.okText}>OK</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dpadBtn} onPress={() => send('RIGHT')}>
            <Text style={styles.dpadText}>RIGHT</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.dpadBtn} onPress={() => send('DOWN')}>
          <Text style={styles.dpadText}>DOWN</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.volContainer}>
        <TouchableOpacity style={styles.volBtn} onPress={() => send('VOL_DOWN')}>
          <Text style={styles.volText}>VOL -</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.volBtn} onPress={() => send('VOL_UP')}>
          <Text style={styles.volText}>VOL +</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.customContainer}>
        <TextInput
          style={styles.input}
          value={customText}
          onChangeText={setCustomText}
          placeholder="Custom message..."
          placeholderTextColor="#888"
        />
        <TouchableOpacity 
          style={styles.sendBtn} 
          onPress={() => {
            send('TEXT', customText);
            setCustomText('');
          }}
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 20,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 40,
    alignItems: 'center',
  },
  status: {
    color: '#2ecc71',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disconnectBtn: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  disconnectText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  dpadContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  dpadRow: {
    flexDirection: 'row',
    marginVertical: 10,
  },
  dpadBtn: {
    backgroundColor: '#2d2d2d',
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 35,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: '#444',
  },
  okBtn: {
    backgroundColor: '#bb86fc',
    borderColor: '#bb86fc',
  },
  dpadText: {
    color: '#aaa',
    fontWeight: 'bold',
  },
  okText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 18,
  },
  volContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
    width: '100%',
  },
  volBtn: {
    backgroundColor: '#1e1e1e',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  volText: {
    color: '#03dac6',
    fontWeight: 'bold',
    fontSize: 16,
  },
  customContainer: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#2d2d2d',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    marginRight: 10,
  },
  sendBtn: {
    backgroundColor: '#bb86fc',
    padding: 14,
    borderRadius: 8,
  },
  sendText: {
    color: '#121212',
    fontWeight: 'bold',
  }
});
