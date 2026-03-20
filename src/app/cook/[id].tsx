// Cook Mode Screen — implemented in Phase 4
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function CookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Cook mode for {id} — coming soon</Text>
    </View>
  );
}
