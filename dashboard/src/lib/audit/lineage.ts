export interface RuntimeLineage {
  git_sha: string;
  strategy_sha: string;
  strategy_version: string;
  freqtrade_version: string;
  docker_image_digest: string;
  protocol_version: string;
  experiment_id: string;
}

function value(name: string, fallback = "unknown") {
  const candidate = process.env[name]?.trim();
  return candidate || fallback;
}

export function runtimeLineage(): RuntimeLineage {
  return {
    git_sha: value("GIT_SHA"),
    strategy_sha: value("STRATEGY_SHA"),
    strategy_version: value("STRATEGY_VERSION", "SimpleSpot-v1"),
    freqtrade_version: value("FREQTRADE_VERSION"),
    docker_image_digest: value("DOCKER_IMAGE_DIGEST"),
    protocol_version: value("PROTOCOL_VERSION", "1"),
    experiment_id: value("EXPERIMENT_ID", "simplespot-v1-baseline"),
  };
}
