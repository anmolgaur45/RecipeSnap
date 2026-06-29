import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';

const PRIMARY = '#1FAA6B';
const BG = '#FBFAF8';
const SURFACE = '#FFFFFF';
const BORDER = '#E6E4DF';
const TEXT = '#1C1B18';
const MUTED = '#8A857C';

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);

  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError('Email and password are required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const res = mode === 'in' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (mode === 'up' && 'needsConfirmation' in res && res.needsConfirmation) {
      setInfo('Account created. Check your email to confirm, then sign in.');
      setMode('in');
    }
    // On success the auth listener flips status and the root layout redirects.
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 30, fontWeight: '800', color: TEXT }}>RecipeSnap</Text>
        <Text style={{ fontSize: 15, color: MUTED, marginTop: 6, marginBottom: 28 }}>
          {mode === 'in' ? 'Sign in to your recipes' : 'Create your account'}
        </Text>

        <Text style={{ fontSize: 13, fontWeight: '600', color: TEXT, marginBottom: 6 }}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={MUTED}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          inputMode="email"
          style={inputStyle}
        />

        <Text style={{ fontSize: 13, fontWeight: '600', color: TEXT, marginTop: 16, marginBottom: 6 }}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          placeholderTextColor={MUTED}
          secureTextEntry
          autoCapitalize="none"
          style={inputStyle}
          onSubmitEditing={submit}
          returnKeyType="go"
        />

        {error ? <Text style={{ color: '#D24A3A', marginTop: 14 }}>{error}</Text> : null}
        {info ? <Text style={{ color: '#1FAA6B', marginTop: 14 }}>{info}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={loading}
          style={{
            marginTop: 24,
            height: 52,
            borderRadius: 16,
            backgroundColor: PRIMARY,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {mode === 'in' ? 'Sign in' : 'Create account'}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setMode(mode === 'in' ? 'up' : 'in');
            setError(null);
            setInfo(null);
          }}
          style={{ marginTop: 18, alignItems: 'center' }}
        >
          <Text style={{ color: MUTED, fontSize: 14 }}>
            {mode === 'in' ? "Don't have an account? " : 'Already have an account? '}
            <Text style={{ color: PRIMARY, fontWeight: '700' }}>{mode === 'in' ? 'Sign up' : 'Sign in'}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  backgroundColor: SURFACE,
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 14,
  paddingHorizontal: 16,
  paddingVertical: 14,
  fontSize: 16,
  color: TEXT,
} as const;
