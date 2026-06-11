import { Link } from "expo-router"
import { StyleSheet, Text, View } from "react-native"

export default function ImportVaultScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Import encrypted vault backup</Text>
      <Text style={styles.body}>Scan the QR code from your web vault.</Text>
      <Link href="/" style={styles.link}>
        Back
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    gap: 16,
    padding: 24,
    backgroundColor: "#101820"
  },
  title: {
    color: "#f4efe6",
    fontSize: 30,
    fontWeight: "800"
  },
  body: {
    color: "#d8ccba",
    fontSize: 17,
    lineHeight: 25
  },
  link: {
    color: "#ffb36b",
    fontSize: 16,
    fontWeight: "700"
  }
})
