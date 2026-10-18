import { Composition } from "remotion";
import { FPS, H, W } from "./theme";
import { HeroLoop } from "./HeroLoop";
import { Hook } from "./Hook";
import { Mechanism } from "./Mechanism";
import { ProofEnd } from "./ProofEnd";

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="Hook"
                component={Hook}
                durationInFrames={60}
                fps={FPS}
                width={W}
                height={H}
            />
            <Composition
                id="Mechanism"
                component={Mechanism}
                durationInFrames={120}
                fps={FPS}
                width={W}
                height={H}
            />
            <Composition
                id="ProofEnd"
                component={ProofEnd}
                durationInFrames={90}
                fps={FPS}
                width={W}
                height={H}
            />
            <Composition
                id="HeroLoop"
                component={HeroLoop}
                durationInFrames={150}
                fps={FPS}
                width={W}
                height={H}
            />
        </>
    );
};
