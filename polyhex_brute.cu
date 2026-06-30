// Brute-force GPU polyhex enumerator — used to independently verify the
// counts produced by the JS constraint-propagating enumerator.
//
// Algorithm: level-wise BFS over ALL free polyhexes (no rule-aware pruning).
// At every level k, each parent polyhex spawns up to 6*k candidate extensions
// in parallel on the GPU. Each candidate is canonicalized under the 12-element
// D6 symmetry group on-GPU; the host then dedupes via std::unordered_set to
// produce level k+1. The degree-3 rule is only applied at the very end
// (when reporting the count), so it can't possibly bias the enumeration.
//
// Outputs one line per level:  "N=<k>: <total> polyhexes, <valid> valid"
//
// Build:   nvcc -O3 -std=c++17 -arch=sm_121 polyhex_brute.cu -o polyhex_brute
// Run:     ./polyhex_brute <maxN>

#include <cstdio>
#include <cstdint>
#include <cstdlib>
#include <climits>
#include <vector>
#include <unordered_set>
#include <algorithm>
#include <chrono>
#include <cuda_runtime.h>

#define CUDA_CHECK(x) do { \
  cudaError_t _e = (x); \
  if (_e != cudaSuccess) { \
    fprintf(stderr, "CUDA error %s at %s:%d\n", cudaGetErrorString(_e), __FILE__, __LINE__); \
    std::exit(2); \
  } \
} while(0)

static constexpr int MAX_N = 16;          // up to N = 15 with one spare slot

__constant__ int d_NEIGH_DQ[6] = {1, 1, 0, -1, -1, 0};
__constant__ int d_NEIGH_DR[6] = {-1, 0, 1, 1, 0, -1};
static const int H_NEIGH_DQ[6] = {1, 1, 0, -1, -1, 0};
static const int H_NEIGH_DR[6] = {-1, 0, 1, 1, 0, -1};

__device__ __host__ inline int32_t pack(int q, int r) {
  return (int32_t)((q & 0xFFFF) << 16) | (int32_t)(r & 0xFFFF);
}
__device__ __host__ inline int unpack_q(int32_t c) {
  return (int)((int16_t)((c >> 16) & 0xFFFF));
}
__device__ __host__ inline int unpack_r(int32_t c) {
  return (int)((int16_t)(c & 0xFFFF));
}

// Apply one of the 12 D6 symmetries (rot in 0..5, mirror in {0,1}), then
// translate so min(q) = min(r) = 0, then insertion-sort the cells.
__device__ static void apply_sym(
  const int32_t* __restrict__ in, int n, int32_t* __restrict__ out,
  int rot, int mirror
) {
  for (int i = 0; i < n; i++) {
    int q = unpack_q(in[i]);
    int r = unpack_r(in[i]);
    if (mirror) { int nq = q + r; int nr = -r; q = nq; r = nr; }
    for (int j = 0; j < rot; j++) { int nq = -r; int nr = q + r; q = nq; r = nr; }
    out[i] = pack(q, r);
  }
  int min_q = INT_MAX, min_r = INT_MAX;
  for (int i = 0; i < n; i++) {
    int q = unpack_q(out[i]); int r = unpack_r(out[i]);
    if (q < min_q) min_q = q;
    if (r < min_r) min_r = r;
  }
  for (int i = 0; i < n; i++) {
    int q = unpack_q(out[i]) - min_q;
    int r = unpack_r(out[i]) - min_r;
    out[i] = pack(q, r);
  }
  for (int i = 1; i < n; i++) {
    int32_t tmp = out[i]; int j = i;
    while (j > 0 && out[j - 1] > tmp) { out[j] = out[j - 1]; j--; }
    out[j] = tmp;
  }
}

__device__ static void canonical(const int32_t* in, int n, int32_t* out) {
  int32_t best[MAX_N]; int32_t tmp[MAX_N];
  bool first = true;
  for (int m = 0; m < 2; m++) {
    for (int rot = 0; rot < 6; rot++) {
      apply_sym(in, n, tmp, rot, m);
      if (first) { for (int i = 0; i < n; i++) best[i] = tmp[i]; first = false; }
      else {
        bool less = false;
        for (int i = 0; i < n; i++) {
          if (tmp[i] < best[i]) { less = true; break; }
          if (tmp[i] > best[i]) break;
        }
        if (less) for (int i = 0; i < n; i++) best[i] = tmp[i];
      }
    }
  }
  for (int i = 0; i < n; i++) out[i] = best[i];
}

__global__ void expand_kernel(
  const int32_t* __restrict__ parents, int n_parents, int parent_size,
  int32_t* __restrict__ candidates, int* __restrict__ counter, int capacity
) {
  int tid = blockIdx.x * blockDim.x + threadIdx.x;
  if (tid >= n_parents) return;
  const int32_t* parent = parents + tid * MAX_N;
  int32_t newp[MAX_N];
  int32_t canon[MAX_N];

  for (int i = 0; i < parent_size; i++) {
    int pq = unpack_q(parent[i]);
    int pr = unpack_r(parent[i]);
    for (int n = 0; n < 6; n++) {
      int nq = pq + d_NEIGH_DQ[n];
      int nr = pr + d_NEIGH_DR[n];
      int32_t newcell = pack(nq, nr);
      bool in_parent = false;
      for (int j = 0; j < parent_size; j++) {
        if (parent[j] == newcell) { in_parent = true; break; }
      }
      if (in_parent) continue;
      for (int j = 0; j < parent_size; j++) newp[j] = parent[j];
      newp[parent_size] = newcell;
      canonical(newp, parent_size + 1, canon);
      int idx = atomicAdd(counter, 1);
      if (idx < capacity) {
        int32_t* dst = candidates + idx * MAX_N;
        for (int j = 0; j < parent_size + 1; j++) dst[j] = canon[j];
      }
    }
  }
}

struct PolyKey {
  int32_t cells[MAX_N];
  int n;
  bool operator==(const PolyKey& o) const {
    if (n != o.n) return false;
    for (int i = 0; i < n; i++) if (cells[i] != o.cells[i]) return false;
    return true;
  }
};

struct PolyHash {
  size_t operator()(const PolyKey& k) const {
    size_t h = 14695981039346656037ULL;
    for (int i = 0; i < k.n; i++) {
      h ^= (size_t)(uint32_t)k.cells[i];
      h *= 1099511628211ULL;
    }
    return h;
  }
};

static bool host_check_deg3(const PolyKey& p) {
  for (int i = 0; i < p.n; i++) {
    int q = unpack_q(p.cells[i]);
    int r = unpack_r(p.cells[i]);
    int deg = 0;
    for (int n = 0; n < 6; n++) {
      int32_t cell = pack(q + H_NEIGH_DQ[n], r + H_NEIGH_DR[n]);
      for (int j = 0; j < p.n; j++) {
        if (p.cells[j] == cell) { deg++; break; }
      }
    }
    if (deg < 3) return false;
  }
  return true;
}

int main(int argc, char** argv) {
  int max_N = (argc > 1) ? std::atoi(argv[1]) : 14;
  if (max_N < 1) max_N = 1;
  if (max_N >= MAX_N) max_N = MAX_N - 1;

  // Level 1.
  std::vector<PolyKey> current;
  current.push_back({{pack(0, 0)}, 1});
  printf("N=1: 1 polyhexes, 0 valid [0 ms]\n"); fflush(stdout);

  // Device buffers — capacity is the number of candidate slots one kernel
  // launch can hold. Each candidate is MAX_N * 4 bytes = 64 B, so 50 M slots
  // = 3.2 GB. d_parents only needs space for one chunk of parents, which is
  // at most CAPACITY / 6 (parents with parent_size = 1 emit 6 children each).
  const int64_t CAPACITY = 50'000'000;
  const int64_t MAX_PARENTS_PER_CHUNK = CAPACITY / 6 + 1;
  int32_t* d_parents = nullptr;
  int32_t* d_candidates = nullptr;
  int*     d_counter = nullptr;
  CUDA_CHECK(cudaMalloc(&d_parents,
      (size_t)MAX_PARENTS_PER_CHUNK * MAX_N * sizeof(int32_t)));
  CUDA_CHECK(cudaMalloc(&d_candidates,
      (size_t)CAPACITY * MAX_N * sizeof(int32_t)));
  CUDA_CHECK(cudaMalloc(&d_counter, sizeof(int)));

  std::vector<int32_t> host_parents_buf;
  std::vector<int32_t> host_cands_buf;

  for (int target_N = 2; target_N <= max_N; target_N++) {
    auto t0 = std::chrono::high_resolution_clock::now();
    int parent_size = target_N - 1;
    int max_children_per_parent = parent_size * 6;
    int chunk_parents = (int)(CAPACITY / max_children_per_parent);
    if (chunk_parents < 1) chunk_parents = 1;

    std::unordered_set<PolyKey, PolyHash> next_set;
    next_set.reserve((size_t)current.size() * 4);

    for (size_t chunk_start = 0; chunk_start < current.size(); chunk_start += (size_t)chunk_parents) {
      size_t chunk_size = std::min((size_t)chunk_parents, current.size() - chunk_start);

      host_parents_buf.assign((size_t)chunk_size * MAX_N, 0);
      for (size_t i = 0; i < chunk_size; i++) {
        for (int j = 0; j < parent_size; j++) {
          host_parents_buf[i * MAX_N + j] = current[chunk_start + i].cells[j];
        }
      }
      CUDA_CHECK(cudaMemcpy(d_parents, host_parents_buf.data(),
                            (size_t)chunk_size * MAX_N * sizeof(int32_t),
                            cudaMemcpyHostToDevice));
      int zero = 0;
      CUDA_CHECK(cudaMemcpy(d_counter, &zero, sizeof(int), cudaMemcpyHostToDevice));

      int block = 128;
      int grid = (int)((chunk_size + block - 1) / block);
      expand_kernel<<<grid, block>>>(d_parents, (int)chunk_size, parent_size,
                                     d_candidates, d_counter, (int)CAPACITY);
      CUDA_CHECK(cudaGetLastError());
      CUDA_CHECK(cudaDeviceSynchronize());

      int n_cands = 0;
      CUDA_CHECK(cudaMemcpy(&n_cands, d_counter, sizeof(int), cudaMemcpyDeviceToHost));
      if (n_cands > CAPACITY) {
        fprintf(stderr, "ERROR: candidate buffer overflow at N=%d (%d > %lld)\n",
                target_N, n_cands, (long long)CAPACITY);
        std::exit(3);
      }
      host_cands_buf.assign((size_t)n_cands * MAX_N, 0);
      CUDA_CHECK(cudaMemcpy(host_cands_buf.data(), d_candidates,
                            (size_t)n_cands * MAX_N * sizeof(int32_t),
                            cudaMemcpyDeviceToHost));

      for (int i = 0; i < n_cands; i++) {
        PolyKey k{};
        k.n = target_N;
        for (int j = 0; j < target_N; j++) k.cells[j] = host_cands_buf[i * MAX_N + j];
        next_set.insert(k);
      }
    }

    current.clear();
    current.reserve(next_set.size());
    for (auto& k : next_set) current.push_back(k);

    int valid = 0;
    for (auto& k : current) if (host_check_deg3(k)) valid++;

    auto t1 = std::chrono::high_resolution_clock::now();
    int64_t ms = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    printf("N=%d: %zu polyhexes, %d valid [%ld ms]\n",
           target_N, current.size(), valid, (long)ms);
    fflush(stdout);
  }

  cudaFree(d_parents);
  cudaFree(d_candidates);
  cudaFree(d_counter);
  return 0;
}
