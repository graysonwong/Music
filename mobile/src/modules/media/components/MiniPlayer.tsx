import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

import { Pause } from "~/icons/Pause";
import { PlayArrow } from "~/icons/PlayArrow";
import { useMusicStore } from "../services/Music";
import { MusicControls } from "../services/Playback";
import { useTheme } from "~/hooks/useTheme";

import { cn } from "~/lib/style";
import { Marquee } from "~/components/Containment/Marquee";
import { IconButton } from "~/components/Form/Button";
import { StyledText } from "~/components/Typography/StyledText";
import { ArtistLinksMarquee } from "~/components/ArtistLinks";
import { NextButton, PreviousButton } from "./MediaControls";
import { MediaImage } from "./MediaImage";

/**
 * Displays a player that appears at the bottom of the screen if we have
 * a song loaded.
 */
export function MiniPlayer({ hidden = false, stacked = false }) {
  const { t } = useTranslation();
  const { surface } = useTheme();
  const isPlaying = useMusicStore((state) => state.isPlaying);
  const track = useMusicStore((state) => state.activeTrack);

  if (!track || hidden) return null;
  return (
    <Animated.View
      layout={LinearTransition}
      className={cn("overflow-hidden rounded-md bg-canvas", {
        "rounded-b-sm": stacked,
      })}
    >
      <Pressable
        onPress={() => router.navigate("/now-playing")}
        className="flex-row items-center bg-surface p-2 active:opacity-75"
      >
        <MediaImage
          type="track"
          size={48}
          source={track.artwork}
          className="rounded-sm"
        />

        <View className="ml-2 shrink grow">
          <Marquee color={surface}>
            <StyledText>{track.name}</StyledText>
          </Marquee>
          <Marquee color={surface}>
            {track.tracksToArtists && track.tracksToArtists.length > 0 ? (
              <ArtistLinksMarquee 
                artists={track.tracksToArtists
                  .sort((a, b) => a.position - b.position)
                  .map(ta => ta.artist.name)
                }
                dim
              />
            ) : (
              <StyledText dim>{track.artistName ?? "—"}</StyledText>
            )}
          </Marquee>
        </View>

        <View className="flex-row items-center">
          <PreviousButton />
          <IconButton
            Icon={isPlaying ? Pause : PlayArrow}
            accessibilityLabel={t(`term.${isPlaying ? "pause" : "play"}`)}
            onPress={MusicControls.playToggle}
            active
            large
          />
          <NextButton />
        </View>
      </Pressable>
    </Animated.View>
  );
}
