import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import { getPerformance } from "firebase/performance";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase only on the client side to avoid SSR issues
export const initFirebase = async () => {
  if (typeof window === "undefined") return null;
  
  if (!firebaseConfig.apiKey) {
    console.warn("Firebase API Key is missing. Analytics and Performance Monitoring will not be initialized.");
    return null;
  }

  try {
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

    const analyticsSupported = await isAnalyticsSupported();
    let analytics = null;
    let performance = null;

    if (analyticsSupported) {
      analytics = getAnalytics(app);
    }
    
    // Performance monitoring
    performance = getPerformance(app);

    return { app, analytics, performance };
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    return null;
  }
};
