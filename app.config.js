require('dotenv').config();

module.exports = {
  expo: {
    name: "Corridor",
    slug: "corridor",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      infoPlist: {
        "NSLocationWhenInUseUsageDescription": "Allow Corridor to access your location to find nearby rides and create corridors."
      },
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
      },
      bundleIdentifier: "com.corridor.mobility"
    },
    android: {
      icon: "./assets/icon.png",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      permissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION"
      ],
      package: "com.corridor.mobility",
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY 
        }
      }
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-audio",
      "expo-asset",
      "expo-location",
      [
        "expo-build-properties",
        {
          "android": {
            "usesCleartextTraffic": true
          }
        }
      ]
    ],
    owner: "daniasterys-team",
    extra: {
      eas: {
        projectId: "dcce3fb8-aaa8-4000-bf85-ef3eb83f4204"
      }
    }
  }
};