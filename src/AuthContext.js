// context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AuthContext = createContext({});

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
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        console.log("💾 [AuthContext] Session recovered successfully:", parsedUser);
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
      console.log("🔓 [AuthContext] Logged in successfully:", userData);
    } catch (e) {
      console.error("AsyncStorage write error:", e);
    }
  };

  const logoutSession = async () => {
    try {
      await AsyncStorage.removeItem("@corridor_user_session");
      setUser(null);
      console.log("🔒 [AuthContext] Session cleared.");
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

export const useAuth = () => useContext(AuthContext);