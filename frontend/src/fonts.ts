// App font loader (Barlow Condensed + IBM Plex Sans) via expo-font.
import { useFonts } from "expo-font";

export const useAppFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    "BarlowCondensed-Medium": require("../assets/fonts/BarlowCondensed-Medium.ttf"),
    "BarlowCondensed-SemiBold": require("../assets/fonts/BarlowCondensed-SemiBold.ttf"),
    "BarlowCondensed-Bold": require("../assets/fonts/BarlowCondensed-Bold.ttf"),
    "IBMPlexSans-Regular": require("../assets/fonts/IBMPlexSans-Regular.ttf"),
    "IBMPlexSans-Medium": require("../assets/fonts/IBMPlexSans-Medium.ttf"),
    "IBMPlexSans-SemiBold": require("../assets/fonts/IBMPlexSans-SemiBold.ttf"),
    "IBMPlexSans-Bold": require("../assets/fonts/IBMPlexSans-Bold.ttf"),
  });
