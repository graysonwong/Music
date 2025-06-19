import type { Href } from "expo-router";
import { router } from "expo-router";
import { Fragment } from "react";
import { Pressable, View } from "react-native";

import { cn } from "~/lib/style";
import { StyledText } from "~/components/Typography/StyledText";

export interface ArtistLinksProps {
  artists: string[];
  className?: string;
  dim?: boolean;
  numberOfLines?: number;
  maxDisplay?: number;
}

/**
 * Component that displays multiple artists as clickable links
 * with proper formatting and truncation
 */
export function ArtistLinks({ 
  artists, 
  className, 
  dim = false, 
  numberOfLines = 1,
  maxDisplay = 3 
}: ArtistLinksProps) {
  if (artists.length === 0) {
    return (
      <StyledText dim={dim} numberOfLines={numberOfLines} className={className}>
        —
      </StyledText>
    );
  }

  if (artists.length === 1 && artists[0]) {
    return (
      <Pressable onPress={() => artists[0] && router.navigate(`/artist/${encodeURIComponent(artists[0])}` as Href)}>
        <StyledText dim={dim} numberOfLines={numberOfLines} className={className}>
          {artists[0] || ''}
        </StyledText>
      </Pressable>
    );
  }

  // Handle multiple artists
  const displayArtists = artists.slice(0, maxDisplay);
  const remainingCount = artists.length - displayArtists.length;

  return (
    <View className="flex-row flex-wrap">
      {displayArtists.map((artist, index) => (
        <Fragment key={artist}>
          <Pressable onPress={() => router.navigate(`/artist/${encodeURIComponent(artist)}` as Href)}>
            <StyledText dim={dim} numberOfLines={numberOfLines} className={className}>
              {artist}
            </StyledText>
          </Pressable>
          {index < displayArtists.length - 1 && (
            <StyledText dim={dim} numberOfLines={numberOfLines} className={className}>
              {index === displayArtists.length - 2 && remainingCount === 0 ? " & " : ", "}
            </StyledText>
          )}
          {index === displayArtists.length - 1 && remainingCount === 0 && displayArtists.length > 1 && (
            <StyledText dim={dim} numberOfLines={numberOfLines} className={className}>
              {" & "}
            </StyledText>
          )}
        </Fragment>
      ))}
      {remainingCount > 0 && (
        <StyledText dim={dim} numberOfLines={numberOfLines} className={className}>
          {displayArtists.length > 1 ? ", " : ""} & {remainingCount} more
        </StyledText>
      )}
    </View>
  );
}

/**
 * Simple component for displaying artists in a marquee-compatible way
 * Used when we need scrolling text behavior
 */
export function ArtistLinksMarquee({ 
  artists, 
  className, 
  dim = false,
  maxDisplay = 3 
}: Omit<ArtistLinksProps, 'numberOfLines'>) {
  if (artists.length === 0) {
    return (
      <StyledText dim={dim} className={className}>
        —
      </StyledText>
    );
  }

  if (artists.length === 1 && artists[0]) {
    return (
      <Pressable onPress={() => artists[0] && router.navigate(`/artist/${encodeURIComponent(artists[0])}` as Href)}>
        <StyledText dim={dim} className={className}>
          {artists[0] || ''}
        </StyledText>
      </Pressable>
    );
  }

  // For marquee, we'll format as a single string with clickable parts
  const displayArtists = artists.slice(0, maxDisplay);
  const remainingCount = artists.length - displayArtists.length;
  
  let formattedText = "";
  if (displayArtists.length === 2 && remainingCount === 0) {
    formattedText = displayArtists.join(" & ");
  } else if (remainingCount === 0) {
    formattedText = displayArtists.slice(0, -1).join(", ") + " & " + displayArtists[displayArtists.length - 1];
  } else {
    formattedText = displayArtists.join(", ") + ` & ${remainingCount} more`;
  }

  // For now, make the whole text clickable to the first artist
  // TODO: Implement proper multi-artist navigation
  return (
    <Pressable onPress={() => artists[0] && router.navigate(`/artist/${encodeURIComponent(artists[0])}` as Href)}>
      <StyledText dim={dim} className={className}>
        {formattedText}
      </StyledText>
    </Pressable>
  );
}