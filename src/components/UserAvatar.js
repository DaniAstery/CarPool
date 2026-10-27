import React, { useState, useEffect } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { resolvePhotoUrl, getInitials, getAvatarColor } from "../utils/avatarUtils";

/**
 * Universal UserAvatar Component
 * Displays user/driver photo if available and valid; falls back gracefully
 * to styled initials or an icon if missing, empty, or if network error occurs.
 */
export default function UserAvatar({
  photoUrl,
  name,
  id,
  size = 40,
  fallbackIcon,
  fallbackBgColor,
  textColor = "#FFFFFF",
  style,
  imageStyle,
  borderRadius,
  serverUrl,
  borderWidth = 0,
  borderColor = "transparent",
  showStatusDot = false,
  statusColor = "#10B981",
}) {
  const [imageError, setImageError] = useState(false);
  const resolvedUri = resolvePhotoUrl(photoUrl, serverUrl);

  // Reset image error whenever the photoUrl changes
  useEffect(() => {
    setImageError(false);
  }, [photoUrl]);

  const radius = borderRadius !== undefined ? borderRadius : size / 2;
  const fontSize = Math.max(10, Math.round(size * 0.38));
  const iconSize = Math.max(11, Math.round(size * 0.45));
  const dotSize = Math.max(8, Math.round(size * 0.26));

  const bgColor = fallbackBgColor || getAvatarColor(id || name);

  return (
    <View style={[styles.wrapper, { width: size, height: size }, style]}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: bgColor,
            borderWidth,
            borderColor,
          },
        ]}
      >
        {resolvedUri && !imageError ? (
          <Image
            source={{ uri: resolvedUri }}
            style={[
              styles.avatarImage,
              { width: size, height: size, borderRadius: radius },
              imageStyle,
            ]}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : name ? (
          <Text
            style={[
              styles.initialsText,
              { fontSize, color: textColor },
            ]}
            numberOfLines={1}
          >
            {getInitials(name)}
          </Text>
        ) : fallbackIcon ? (
          <Ionicons name={fallbackIcon} size={iconSize} color={textColor} />
        ) : (
          <FontAwesome5 name="user" size={iconSize} color={textColor} />
        )}
      </View>

      {showStatusDot && (
        <View
          style={[
            styles.statusDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: statusColor,
              right: 0,
              bottom: 0,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  circle: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  initialsText: {
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  statusDot: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
});
