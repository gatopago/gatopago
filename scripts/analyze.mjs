// The standard parser avoids Oxc raw transfer's 6 GiB allocation on smaller machines.
process.env.KNIP_DISABLE_RAW_TRANSFER = '1';
await import('../node_modules/knip/bin/knip.js');
