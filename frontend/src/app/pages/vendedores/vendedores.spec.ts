import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Vendedores } from './vendedores';

describe('Vendedores', () => {
  let component: Vendedores;
  let fixture: ComponentFixture<Vendedores>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Vendedores]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Vendedores);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
