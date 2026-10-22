import { Product } from '../types/product.types.js';

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod-001',
    name: 'Lost Mary MO10000 Watermelon Ice',
    slug: 'lost-mary-mo10000-watermelon-ice',
    brand: 'Lost Mary',
    category: 'disposables',
    shortDescription: '10,000 Puffs con pantalla inteligente y sabor refrescante a sandía.',
    description: 'El vaporizador desechable Lost Mary MO10000 ofrece hasta 10,000 caladas de puro sabor a sandía fresca con toque mentolado. Equipado con pantalla LED inteligente que indica porcentaje de líquido y batería en tiempo real.',
    price: 65000,
    compareAtPrice: 75000,
    inStock: true,
    stock: 24,
    imageUrl: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80',
    featured: true,
    isBestSeller: true,
    specs: {
      puffCount: 10000,
      nicotineStrength: '50mg (5%)',
      flavorProfile: 'Sandía Helada / Mentol',
      liquidCapacity: '18ml',
      batteryCapacity: '600mAh USB-C',
      rechargeable: true
    },
    tags: ['desechable', 'pantalla led', 'sandia', 'bestseller']
  },
  {
    id: 'prod-002',
    name: 'Geekvape Wenax Q Pro Pod Kit',
    slug: 'geekvape-wenax-q-pro',
    brand: 'Geekvape',
    category: 'pod-systems',
    shortDescription: 'Kit de Pod recargable de alta precisión, potencia ajustable hasta 30W.',
    description: 'El Wenax Q Pro eleva la experiencia de pods recargables con pantalla táctil hápitca, batería de 1200mAh de larga duración y compatibilidad total con toda la serie de cartuchos Geekvape Q.',
    price: 135000,
    compareAtPrice: 150000,
    inStock: true,
    stock: 12,
    imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80',
    featured: true,
    isNewArrival: true,
    specs: {
      nicotineStrength: 'Variable según e-líquido',
      liquidCapacity: '2ml',
      batteryCapacity: '1200mAh USB-C',
      resistance: '0.6 / 0.8 / 1.2 ohm',
      rechargeable: true
    },
    tags: ['pod system', 'recargable', 'geekvape', '30W']
  },
  {
    id: 'prod-003',
    name: 'Nasty Juice Cush Man Mango Salt Nic 30ml',
    slug: 'nasty-juice-cush-man-mango-salt-30ml',
    brand: 'Nasty Juice',
    category: 'salt-nic',
    shortDescription: 'El legendario mango maduro tropical en sales de nicotina.',
    description: 'Cush Man de Nasty Juice es mundialmente aclamado por recrear el sabor auténtico, dulce y jugoso del mango maduro con una sensación suave y satisfactoria de sales de nicotina.',
    price: 55000,
    inStock: true,
    stock: 35,
    imageUrl: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=600&q=80',
    featured: true,
    specs: {
      nicotineStrength: '35mg (3.5%)',
      flavorProfile: 'Mango Tropical Maduro',
      liquidCapacity: '30ml'
    },
    tags: ['sales de nicotina', 'mango', 'nasty juice']
  },
  {
    id: 'prod-004',
    name: 'Oxva Xlim Pro Pod Kit',
    slug: 'oxva-xlim-pro-pod-kit',
    brand: 'OXVA',
    category: 'pod-systems',
    shortDescription: 'El rey del sabor MTL / RDL con pantalla RGB y batería de 1000mAh.',
    description: 'El OXVA Xlim Pro destaca por su increíble entrega de sabor tanto en sales de nicotina como en líquidos base libre. Chasis de aleación de zinc y acabado brillante de fibra de carbono.',
    price: 140000,
    inStock: true,
    stock: 8,
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80',
    featured: true,
    isBestSeller: true,
    specs: {
      nicotineStrength: 'Variable',
      liquidCapacity: '2ml Top Fill',
      batteryCapacity: '1000mAh USB-C',
      resistance: '0.6 / 0.8 ohm'
    },
    tags: ['oxva', 'xlim', 'pod kit', 'top fill']
  },
  {
    id: 'prod-005',
    name: 'Elf Bar BC10000 Strawberry Kiwi',
    slug: 'elf-bar-bc10000-strawberry-kiwi',
    brand: 'Elf Bar',
    category: 'disposables',
    shortDescription: '10,000 Puffs con tecnología Quaq Mesh Coil.',
    description: 'Fusión perfecta de fresas dulces y kiwi ácido con la tecnología Quaq Mesh Coil que previene sabor a quemado hasta la última gota de e-líquido.',
    price: 60000,
    compareAtPrice: 70000,
    inStock: true,
    stock: 19,
    imageUrl: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80',
    featured: false,
    specs: {
      puffCount: 10000,
      nicotineStrength: '50mg (5%)',
      flavorProfile: 'Fresa Kiwi Helado',
      liquidCapacity: '18ml',
      batteryCapacity: '620mAh USB-C',
      rechargeable: true
    },
    tags: ['desechable', 'elf bar', 'fresa kiwi']
  },
  {
    id: 'prod-006',
    name: 'Vaporesso GTX Coils Pack x5',
    slug: 'vaporesso-gtx-coils-pack-5',
    brand: 'Vaporesso',
    category: 'coils-accessories',
    shortDescription: 'Resistencias de malla de alto rendimiento para Target, Luxe y Gen.',
    description: 'Pack de 5 resistencias Vaporesso GTX Mesh diseñadas para una producción de vapor densa y vida útil prolongada con algodón de lino antibacteriano.',
    price: 52000,
    inStock: false,
    stock: 0,
    imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80',
    featured: false,
    specs: {
      nicotineStrength: 'N/A',
      resistance: '0.2 / 0.3 / 0.8 ohm'
    },
    tags: ['resistencias', 'coils', 'vaporesso', 'repuesto']
  }
];
