import React, { createContext, useState, useEffect, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 1. Initialize the Context matrix channel
const AuthContext = createContext({});

// 2. Named Export: AuthProvider component wrapper
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredProfileData();
  }, []);

  const loadStoredProfileData = async () => {
    try {
      const storedUser = await AsyncStorage.getItem("@corridor_user_session");
      if (storedUser) {
        setUser(JSON.parse(storedUser));
        console.log("💾 Session recovered successfully:", JSON.parse(storedUser));
      }
    } catch (e) {
      console.error("AsyncStorage read error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loginSession = async (userData) => {
    try {
      await AsyncStorage.setItem("@corridor_user_session", JSON.stringify(userData));
      setUser(userData);
    } catch (e) {
      console.error("AsyncStorage write error:", e);
    }
  };

  const logoutSession = async () => {
    try {
      await AsyncStorage.removeItem("@corridor_user_session");
      setUser(null);
    } catch (e) {
      console.error("AsyncStorage deletion error:", e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, loginSession, logoutSession }}>
      {children}
    </AuthContext.Provider>
  );
};

// 3. Named Export: Custom hook engine for easy access inside UI screens
export const useAuth = () => useContext(AuthContext);