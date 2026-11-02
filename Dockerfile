FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
ARG TARGETARCH
# The version and sums match @pnpm/exe.linux-*-musl in pnpm-lock.yaml. Update all three when pnpm changes.
ARG PNPM_VERSION=12.15.0
ARG PNPM_SHA512_ARM64=a4d0b7f24f8efbdd053a36cf3529f0d04edaa6ad4f2939b3ddf15ed5a9a7fa5cacfd4e642fefaece2afc6d18a1a3c38d73203777d114ef076a718d032a48fe24
ARG PNPM_SHA512_AMD64=03d274260d11771faa414e2a5edc32493e6db68f483aed738b87c3937e676dce8359a86081b70ab45bd93ca1702f6aa0517197397fff857bfacffb29e9e98ef0
RUN apk add --no-cache git \
	&& case "$TARGETARCH" in \
		arm64) arch=arm64 sum=$PNPM_SHA512_ARM64 ;; \
		amd64) arch=x64 sum=$PNPM_SHA512_AMD64 ;; \
		*) echo "No pinned pnpm build for architecture '$TARGETARCH'" >&2 && exit 1 ;; \
	esac \
	&& cd /tmp \
	&& tarball=$(npm pack "@pnpm/exe.linux-$arch-musl@$PNPM_VERSION" --silent) \
	&& echo "$sum  $tarball" | sha512sum -c - \
	&& tar xzf "$tarball" -C /usr/local/bin --strip-components=1 package/pnpm \
	&& rm -rf "$tarball" /root/.npm \
	&& mkdir -p /repo/node_modules && chown -R node:node /repo
WORKDIR /repo
USER node
