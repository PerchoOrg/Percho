/**
 * TourRequestSheet — what "Request a tour" opens (phase C).
 *
 * Until now the dock's primary CTA only enqueued a telemetry event; this
 * sheet makes it a lead. It POSTs the web app's existing `/api/leads`
 * endpoint (validation, agent routing and the notification email all live
 * server-side — see `leadsUrl()` in `lib/api/base.ts`), tagged
 * `source: "mobile_tour"`.
 *
 * The caller gates on sign-in before opening, so the email is prefilled from
 * the session; name is the only thing most buyers type. Overlay pattern
 * matches the page's other overlays (PhotoGrid): mounted only while open.
 */
import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { leadsUrl } from "../../../lib/api/base";
import { useAuthStore } from "../../../state/auth";
import { explore, exploreRadii, radii } from "../../../theme/tokens";

export interface TourRequestSheetProps {
	listingId: string;
	address: string;
	onClose: () => void;
}

type Phase = "form" | "sending" | "sent";

export function TourRequestSheet(props: TourRequestSheetProps) {
	const { listingId, address, onClose } = props;
	const insets = useSafeAreaInsets();
	const sessionEmail = useAuthStore((s) => s.session?.user.email ?? "");

	const [name, setName] = useState("");
	const [email, setEmail] = useState(sessionEmail);
	const [phone, setPhone] = useState("");
	const [message, setMessage] = useState("");
	const [phase, setPhase] = useState<Phase>("form");
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (name.trim().length === 0) {
			setError("Please tell the agent your name.");
			return;
		}
		if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
			setError("That doesn't look like an email address.");
			return;
		}
		setError(null);
		setPhase("sending");
		try {
			const res = await fetch(leadsUrl(), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					listing_id: listingId,
					name: name.trim(),
					email: email.trim().toLowerCase(),
					phone: phone.trim() || null,
					message: message.trim() || null,
					source: "mobile_tour",
				}),
			});
			if (!res.ok) throw new Error(String(res.status));
			setPhase("sent");
		} catch {
			setPhase("form");
			setError(
				"Couldn't send the request. Check your connection and try again.",
			);
		}
	};

	return (
		<View style={StyleSheet.absoluteFill}>
			<Pressable
				style={styles.backdrop}
				onPress={phase === "sending" ? undefined : onClose}
				accessibilityLabel="Close"
			/>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={styles.kav}
				pointerEvents="box-none"
			>
				<View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
					{phase === "sent" ? (
						<>
							<Text style={styles.title}>Request sent</Text>
							<Text style={styles.sub}>
								An agent will reach out about {address} shortly.
							</Text>
							<Pressable style={styles.cta} onPress={onClose}>
								<Text style={styles.ctaTxt}>Done</Text>
							</Pressable>
						</>
					) : (
						<>
							<Text style={styles.title}>Request a tour</Text>
							<Text style={styles.sub}>{address}</Text>
							<TextInput
								style={styles.input}
								value={name}
								onChangeText={setName}
								placeholder="Your name"
								placeholderTextColor={explore.muted}
								autoComplete="name"
								editable={phase === "form"}
							/>
							<TextInput
								style={styles.input}
								value={email}
								onChangeText={setEmail}
								placeholder="Email"
								placeholderTextColor={explore.muted}
								keyboardType="email-address"
								autoCapitalize="none"
								autoComplete="email"
								editable={phase === "form"}
							/>
							<TextInput
								style={styles.input}
								value={phone}
								onChangeText={setPhone}
								placeholder="Phone (optional)"
								placeholderTextColor={explore.muted}
								keyboardType="phone-pad"
								autoComplete="tel"
								editable={phase === "form"}
							/>
							<TextInput
								style={[styles.input, styles.inputMultiline]}
								value={message}
								onChangeText={setMessage}
								placeholder="Anything the agent should know? (optional)"
								placeholderTextColor={explore.muted}
								multiline
								editable={phase === "form"}
							/>
							{error ? <Text style={styles.error}>{error}</Text> : null}
							<Pressable
								style={[styles.cta, phase === "sending" && styles.ctaDisabled]}
								onPress={submit}
								disabled={phase === "sending"}
								accessibilityRole="button"
							>
								{phase === "sending" ? (
									<ActivityIndicator color={explore.surface} />
								) : (
									<Text style={styles.ctaTxt}>Send request</Text>
								)}
							</Pressable>
						</>
					)}
				</View>
			</KeyboardAvoidingView>
		</View>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(8,16,13,0.45)",
	},
	kav: { flex: 1, justifyContent: "flex-end" },
	sheet: {
		backgroundColor: explore.surface,
		borderTopLeftRadius: exploreRadii.card,
		borderTopRightRadius: exploreRadii.card,
		paddingHorizontal: 20,
		paddingTop: 20,
		gap: 10,
	},
	title: { fontSize: 20, fontWeight: "700", color: explore.ink },
	sub: { fontSize: 14, color: explore.ink2, marginBottom: 6 },
	input: {
		backgroundColor: explore.chip,
		borderRadius: radii.btn,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 15,
		color: explore.ink,
	},
	inputMultiline: { minHeight: 72, textAlignVertical: "top" },
	error: { fontSize: 13, color: explore.negInk },
	cta: {
		backgroundColor: explore.brand,
		borderRadius: radii.pill,
		minHeight: 50,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 4,
	},
	ctaDisabled: { opacity: 0.6 },
	ctaTxt: { fontSize: 16, fontWeight: "600", color: explore.surface },
});
